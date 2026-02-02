import { useState, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import Editor, { OnMount } from "@monaco-editor/react";
import { writeTextFile, readTextFile, BaseDirectory, exists } from '@tauri-apps/plugin-fs';

interface Snippet {
  id: number;
  title: string;
  code: string;
  language: string;
  tags: string[];
}

const FILE_NAME = 'devmind_data.json';

function App() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [tagsInput, setTagsInput] = useState("");
  const [status, setStatus] = useState("Ready");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://ai.sumopod.com/v1");
  const [aiResponse, setAiResponse] = useState("");
  const [suggestedCode, setSuggestedCode] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiConfig, setShowAiConfig] = useState(false);

  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    async function loadData() {
      try {
        const fileExists = await exists(FILE_NAME, { baseDir: BaseDirectory.Document });
        if (fileExists) {
          const content = await readTextFile(FILE_NAME, { baseDir: BaseDirectory.Document });
          const parsedData = JSON.parse(content);
          const migratedData = parsedData.map((item: any) => ({
            ...item,
            tags: item.tags || []
          }));
          setSnippets(migratedData);
          setStatus("System Ready");
        } else {
            setStatus("System Ready");
        }
      } catch (err) {
        setStatus("Error loading data");
      }
    }
    loadData();
  }, []);

  const saveDataToDisk = async (newSnippets: Snippet[]) => {
    try {
      await writeTextFile(FILE_NAME, JSON.stringify(newSnippets), {
        baseDir: BaseDirectory.Document
      });
    } catch (err) {
      setStatus("Failed to save to disk");
    }
  };

  const handleSaveSnippet = () => {
    if (!title.trim()) {
        alert("Judul snippet tidak boleh kosong! Silakan isi judul terlebih dahulu.");
        setStatus("⚠️ Title is required!");
        return;
    }

    if (!code.trim()) {
        alert("Editor kode masih kosong! Silakan tulis kode terlebih dahulu.");
        setStatus("⚠️ Code is required!");
        return;
    }

    const processedTags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

    let updatedSnippets: Snippet[];

    if (editingId !== null) {
        updatedSnippets = snippets.map((s) =>
            s.id === editingId
                ? { ...s, title, code, language, tags: processedTags }
                : s
        );
        setStatus("Snippet Updated Successfully");
        setEditingId(null);
    } else {
        const newSnippet: Snippet = {
            id: Date.now(),
            title,
            code,
            language,
            tags: processedTags
        };
        updatedSnippets = [newSnippet, ...snippets];
        setStatus("Snippet Saved Successfully");
    }

    setSnippets(updatedSnippets);
    saveDataToDisk(updatedSnippets);

    setTitle("");
    setCode("");
    setTagsInput("");
    setTimeout(() => setStatus("Ready"), 2000);
  };

  const startEdit = (snippet: Snippet) => {
    setTitle(snippet.title);
    setCode(snippet.code);
    setLanguage(snippet.language);
    setTagsInput(snippet.tags.join(", "));
    setEditingId(snippet.id);
    setStatus(`Editing: ${snippet.title}`);
  };

  const cancelEdit = () => {
    setTitle("");
    setCode("");
    setTagsInput("");
    setEditingId(null);
    setStatus("Edit Cancelled");
  };

  const deleteSnippet = (id: number) => {
    if (window.confirm("Are you sure you want to delete this snippet?")) {
        const updatedSnippets = snippets.filter((s) => s.id !== id);
        setSnippets(updatedSnippets);
        saveDataToDisk(updatedSnippets);
        if (editingId === id) cancelEdit();
        setStatus("Snippet Deleted");
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard! 📋");
    setTimeout(() => setStatus("Ready"), 1500);
  };

  const askAI = async (mode: 'explain' | 'refactor') => {
    if (!apiKey) {
      setShowAiConfig(true);
      return alert("Please configure API Key first.");
    }
    if (!code) return alert("Code editor is empty.");

    setIsAiLoading(true);
    setAiResponse("");
    setSuggestedCode("");
    setStatus(mode === 'refactor' ? "AI is fixing code..." : "AI is analyzing...");

    try {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
      const ENDPOINT = `${cleanBaseUrl}/chat/completions`;

      const systemPrompt = mode === 'refactor'
        ? "You are a Senior Developer. Fix, optimize, and refactor the following code. RETURN ONLY THE FIXED CODE INSIDE A MARKDOWN CODE BLOCK."
        : "Explain the following code briefly. Mention potential bugs if any.";

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Language: ${language}\n\nCode:\n${code}` }
          ],
          temperature: 0.5,
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error?.message || "Failed to fetch AI response");

      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        setAiResponse(content);
        setStatus("AI Task Completed");

        if (mode === 'refactor') {
            const codeBlockRegex = /```(?:[\w]*\n)?([\s\S]*?)```/;
            const match = content.match(codeBlockRegex);
            if (match && match[1]) {
                setSuggestedCode(match[1].trim());
            }
        }

      } else {
        setAiResponse("No response from AI.");
      }

    } catch (error: any) {
      setAiResponse(`Error: ${error.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyAiFix = () => {
    if (suggestedCode) {
        setCode(suggestedCode);
        setSuggestedCode("");
        setStatus("AI Fix Applied ✨");
    }
  };

  const filteredSnippets = snippets.filter((item) => {
    const query = searchQuery.toLowerCase();
    const inTitle = item.title.toLowerCase().includes(query);
    const inCode = item.code.toLowerCase().includes(query);
    const inTags = item.tags.some(t => t.toLowerCase().includes(query));
    return inTitle || inCode || inTags;
  });

  return (
    <div className="h-screen w-full bg-[#0f1117] flex flex-col font-sans overflow-hidden text-slate-300 selection:bg-indigo-500/30">
      
      {/* HEADER */}
      <header className="h-16 shrink-0 border-b border-white/5 bg-[#0f1117]/80 backdrop-blur-xl flex justify-between items-center px-6 z-20 relative">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <span className="text-lg font-bold text-white">DM</span>
            </div>
            <div>
                <h1 className="text-lg font-bold text-white tracking-tight leading-none">
                    DevMind <span className="text-indigo-400 font-light">Pro</span>
                </h1>
                <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">Code Manager & AI Assistant</p>
            </div>
        </div>

        <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/50 border border-white/5">
                <span className={`w-2 h-2 rounded-full ${status === 'Error loading data' ? 'bg-red-500' : 'bg-emerald-500'} animate-pulse`}></span>
                <span className="text-xs text-slate-400 font-mono">{status}</span>
             </div>

            <button
                onClick={() => setShowAiConfig(!showAiConfig)}
                className={`text-xs flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${showAiConfig ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
            >
                ⚙️ <span className="hidden sm:inline">AI Config</span>
            </button>
        </div>
      </header>

      {/* AI CONFIG MODAL (POPOVER) */}
      {showAiConfig && (
        <div className="absolute top-20 right-6 w-80 bg-[#1e293b] p-4 rounded-xl border border-slate-600/50 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">🤖 AI Configuration</h3>
            <div className="space-y-3">
                <div className="space-y-1">
                    <label className="text-xs text-slate-400">Base URL</label>
                    <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input-field w-full text-xs" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-slate-400">API Key</label>
                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-field w-full text-xs" />
                </div>
                <p className="text-[10px] text-slate-500 italic">Compatible with OpenAI & DeepSeek formats.</p>
            </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL: EDITOR */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-4">
          
          {/* EDITOR CONTROLS */}
          <div className="flex gap-3">
            <div className="flex-1 relative group">
                <input
                    type="text" 
                    placeholder="Snippet Title..."
                    className="input-field w-full font-bold text-white placeholder:font-normal"
                    value={title} onChange={(e) => setTitle(e.target.value)}
                />
            </div>
            <div className="w-36">
                <select
                    className="input-field w-full cursor-pointer appearance-none bg-no-repeat bg-[right_1rem_center]"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
                    value={language} onChange={(e) => setLanguage(e.target.value)}
                >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="sql">SQL</option>
                    <option value="json">JSON</option>
                    <option value="rust">Rust</option>
                </select>
            </div>
          </div>

          <div className="relative">
             <span className="absolute left-3 top-2.5 text-slate-500 text-xs select-none">#</span>
             <input
                type="text" placeholder="Tags: react, api, utils..."
                className="input-field w-full pl-7"
                value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          {/* MONACO EDITOR CONTAINER */}
          <div className={`flex-1 rounded-xl overflow-hidden border shadow-2xl relative group transition-all duration-300 ${editingId ? 'border-amber-500/50 shadow-amber-900/10' : 'border-slate-800 shadow-black/40'}`}>
            <Editor
                height="100%"
                defaultLanguage="javascript"
                language={language}
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value || "")}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontLigatures: true,
                    lineHeight: 24,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 20, bottom: 20 },
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    renderLineHighlight: "all",
                }}
            />
            {/* Overlay hint if empty */}
            {!code && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                    <span className="text-4xl font-bold text-slate-600">Start Coding</span>
                </div>
            )}
          </div>

          {/* ACTION BAR */}
          <div className="flex gap-3 items-center">
            {editingId && (
                <button onClick={cancelEdit} className="btn-secondary">
                    Cancel
                </button>
            )}
            <button
                onClick={handleSaveSnippet}
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all shadow-lg ${
                    editingId 
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20" 
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20"
                }`}
            >
                {editingId ? "Update Changes" : "Save Snippet"}
            </button>

            <div className="h-8 w-[1px] bg-white/10 mx-1"></div>

            <div className="flex gap-2">
                <button
                    onClick={() => askAI('explain')}
                    disabled={isAiLoading}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-sm font-medium transition-all disabled:opacity-50"
                >
                    {isAiLoading ? "Thinking..." : "🧠 Explain"}
                </button>
                <button
                    onClick={() => askAI('refactor')}
                    disabled={isAiLoading}
                    className="px-4 py-2.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-800/50 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                    {isAiLoading ? "Working..." : "✨ Fix & Refactor"}
                </button>
            </div>
          </div>

          {/* AI PANEL */}
          {(aiResponse || suggestedCode) && (
            <div className="bg-slate-900/90 p-4 rounded-xl border border-indigo-500/30 shadow-2xl flex flex-col gap-3 animate-in slide-in-from-bottom-5">
                <div className="flex justify-between items-start border-b border-white/5 pb-2">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        ✦ AI Insight
                    </span>
                    <div className="flex gap-2">
                        {suggestedCode && (
                            <button
                                onClick={applyAiFix}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded transition-colors font-bold"
                            >
                                ✓ Apply Fix
                            </button>
                        )}
                        <button onClick={() => {setAiResponse(""); setSuggestedCode("");}} className="text-[10px] text-slate-400 hover:text-white transition-colors">Dismiss</button>
                    </div>
                </div>
                <div className="text-sm text-slate-300 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar p-2">
                    <ReactMarkdown
                        components={{
                            code({node, inline, className, children, ...props}: any) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                    <div className="rounded-md overflow-hidden my-2 border border-slate-700 shadow-sm">
                                        <SyntaxHighlighter
                                            style={vscDarkPlus}
                                            language={match[1]}
                                            PreTag="div"
                                            customStyle={{ margin: 0, padding: '1rem', fontSize: '0.8rem' }}
                                            {...props}
                                        >
                                            {String(children).replace(/\n$/, '')}
                                        </SyntaxHighlighter>
                                    </div>
                                ) : (
                                    <code className="bg-slate-700/50 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                                        {children}
                                    </code>
                                )
                            }
                        }}
                    >
                        {aiResponse}
                    </ReactMarkdown>
                </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: LIBRARY */}
        <div className="w-[400px] bg-[#13151c] border-l border-white/5 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 bg-[#13151c]/95 backdrop-blur z-10">
            <div className="relative group">
                <span className="absolute left-3 top-2.5 text-slate-500 group-focus-within:text-indigo-400 transition-colors">🔍</span>
                <input
                    type="text" placeholder="Search snippets..."
                    className="w-full bg-[#0f1117] border border-slate-800 text-slate-200 pl-9 pr-3 py-2 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 text-sm transition-all"
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
            {filteredSnippets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-600">
                <span className="text-2xl mb-2">🔭</span>
                <p className="text-sm">No snippets found.</p>
              </div>
            ) : (
              filteredSnippets.map((item) => (
                <div 
                    key={item.id} 
                    className={`group bg-[#1e293b]/40 rounded-xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5
                    ${editingId === item.id 
                        ? "border-amber-500/50 bg-amber-900/5 ring-1 ring-amber-500/20" 
                        : "border-white/5 hover:border-indigo-500/30 hover:bg-[#1e293b]/80"
                    }`}
                >
                  {/* Card Header */}
                  <div className="px-3 py-2.5 flex justify-between items-start">
                    <div className="overflow-hidden mr-2">
                        <h3 className={`font-bold text-sm truncate mb-1.5 ${editingId === item.id ? 'text-amber-400' : 'text-slate-200 group-hover:text-white'}`}>
                            {item.title}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">{item.language}</span>
                            {item.tags.map((tag, idx) => (
                                <span key={idx} className="text-[10px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Quick Actions (Visible on Hover) */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(item)} className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-amber-400 transition-colors" title="Edit">✏️</button>
                      <button onClick={() => copyToClipboard(item.code)} className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-emerald-400 transition-colors" title="Copy">📋</button>
                      <button onClick={() => deleteSnippet(item.id)} className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-red-400 transition-colors" title="Delete">🗑️</button>
                    </div>
                  </div>

                  {/* Code Preview */}
                  <div 
                    className="max-h-24 overflow-hidden relative bg-[#0f1117]/50 border-t border-white/5 cursor-pointer"
                    onClick={() => startEdit(item)}
                  >
                    <SyntaxHighlighter
                        language={item.language}
                        style={vscDarkPlus}
                        customStyle={{ 
                            margin: 0, 
                            padding: '0.75rem', 
                            fontSize: '0.7rem', 
                            lineHeight: '1.4',
                            background: 'transparent',
                            pointerEvents: 'none'
                        }}
                    >
                        {item.code}
                    </SyntaxHighlighter>
                    {/* Fade Out Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1e293b] via-transparent to-transparent pointer-events-none opacity-80"></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;