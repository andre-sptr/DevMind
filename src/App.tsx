import { useState, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import Editor, { OnMount } from "@monaco-editor/react";
import { writeTextFile, readTextFile, BaseDirectory, exists } from '@tauri-apps/plugin-fs';

// --- Types ---
interface Snippet {
  id: number;
  title: string;
  code: string;
  language: string;
  tags: string[];
}

const FILE_NAME = 'devmind_data.json';

// --- Icons Components (Inline SVG for sleek look without deps) ---
const Icons = {
  Search: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Plus: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  Save: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Code: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
  Brain: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  Settings: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Copy: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Magic: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Spinner: () => (
    <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  )
};

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
        setStatus("⚠️ Title is required!");
        return;
    }

    const processedTags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    let updatedSnippets: Snippet[];

    if (editingId !== null) {
        updatedSnippets = snippets.map((s) =>
            s.id === editingId ? { ...s, title, code, language, tags: processedTags } : s
        );
        setStatus("Snippet Updated");
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
        setStatus("Snippet Saved");
    }

    setSnippets(updatedSnippets);
    saveDataToDisk(updatedSnippets);
    resetForm();
    setTimeout(() => setStatus("Ready"), 2000);
  };

  const resetForm = () => {
    setTitle("");
    setCode("");
    setTagsInput("");
    setEditingId(null);
  };

  const startEdit = (snippet: Snippet) => {
    setTitle(snippet.title);
    setCode(snippet.code);
    setLanguage(snippet.language);
    setTagsInput(snippet.tags.join(", "));
    setEditingId(snippet.id);
    setStatus(`Editing: ${snippet.title}`);
  };

  const deleteSnippet = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete this snippet?")) {
        const updatedSnippets = snippets.filter((s) => s.id !== id);
        setSnippets(updatedSnippets);
        saveDataToDisk(updatedSnippets);
        if (editingId === id) resetForm();
        setStatus("Snippet Deleted");
    }
  };

  const copyToClipboard = async (text: string, e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard!");
    setTimeout(() => setStatus("Ready"), 1500);
  };

  const askAI = async (mode: 'explain' | 'refactor') => {
    if (!apiKey) {
      setShowAiConfig(true);
      return;
    }

    let codeToAnalyze = code;
    const editor = editorRef.current;
    
    if (editor) {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
            const selectedText = editor.getModel().getValueInRange(selection);
            if (selectedText.trim().length > 0) {
                codeToAnalyze = selectedText;
            }
        }
    }

    if (!codeToAnalyze.trim()) return;

    setIsAiLoading(true);
    setAiResponse("");
    setSuggestedCode("");
    const scope = codeToAnalyze.length < code.length ? "Selection" : "File";
    setStatus(`AI processing (${scope})...`);

    try {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
      const ENDPOINT = `${cleanBaseUrl}/chat/completions`;
      
      let systemPrompt = "";

      if (mode === 'refactor') {
        systemPrompt = "Anda adalah Senior Developer. Tugas anda: 1. Perbaiki dan optimalkan kode yang diberikan. 2. Jawab dalam BAHASA INDONESIA. 3. Berikan kode hasil perbaikan di dalam Markdown Code Block. 4. Berikan penjelasan singkat poin per poin mengapa kode tersebut diubah.";
      } else {
        systemPrompt = "Anda adalah Asisten Coding berbahasa Indonesia. Jelaskan kode berikut dalam BAHASA INDONESIA. " +
        "PENTING: \n" +
        "1. JANGAN gunakan paragraf panjang. Gunakan format POIN-POIN (Bullet Points) agar mudah dibaca.\n" +
        "2. Jelaskan logika utamanya saja secara ringkas.\n" +
        "3. Jika ada potensi bug/error, sebutkan di bagian akhir dengan peringatan emoji ⚠️.";
      }

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Language: ${language}\n\nCode Snippet:\n${codeToAnalyze}` }
          ],
          temperature: 0.3,
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "AI Error");

      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        setAiResponse(content);
        setStatus("AI Completed");
        if (mode === 'refactor') {
            const match = content.match(/```(?:[\w]*\n)?([\s\S]*?)```/);
            if (match && match[1]) setSuggestedCode(match[1].trim());
        }
      }
    } catch (error: any) {
      setAiResponse(`Error: ${error.message}`);
      setStatus("AI Failed");
    } finally {
      setIsAiLoading(false);
    }
  };

  const filteredSnippets = snippets.filter((item) => {
    const query = searchQuery.toLowerCase();
    return item.title.toLowerCase().includes(query) || 
           item.tags.some(t => t.toLowerCase().includes(query));
  });

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-300 overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* SIDEBAR (LEFT) */}
      <div className="w-72 shrink-0 flex flex-col glass-sidebar z-20">
        {/* Brand */}
        <div className="h-14 flex items-center px-4 border-b border-white/[0.08]">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center mr-3 shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                <span className="font-bold text-white text-xs">D</span>
            </div>
            <span className="font-bold text-zinc-100 tracking-tight">DevMind</span>
            <span className="text-[10px] ml-auto px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">v1.0</span>
        </div>

        {/* Search & Actions */}
        <div className="p-3 space-y-2">
             <button 
                onClick={resetForm}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-900/20 group"
             >
                <Icons.Plus /> <span>New Snippet</span>
             </button>

             <div className="relative group">
                <div className="absolute left-3 top-2.5 text-zinc-500 group-focus-within:text-indigo-400 transition-colors">
                    <Icons.Search />
                </div>
                <input 
                    type="text" 
                    placeholder="Search..." 
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/50 focus:bg-zinc-900 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
             </div>
        </div>

        {/* Snippet List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 custom-scrollbar">
            {filteredSnippets.length === 0 ? (
                <div className="text-center py-10 text-zinc-600 text-xs">No snippets found</div>
            ) : (
                filteredSnippets.map((item) => (
                    <div 
                        key={item.id}
                        onClick={() => startEdit(item)}
                        className={`group px-3 py-3 rounded-lg cursor-pointer border transition-all duration-200 relative
                            ${editingId === item.id 
                                ? 'bg-zinc-800/80 border-indigo-500/30 shadow-sm' 
                                : 'bg-transparent border-transparent hover:bg-zinc-800/40 hover:border-zinc-800'
                            }`}
                    >
                        <h4 className={`text-sm font-medium mb-1 truncate pr-6 ${editingId === item.id ? 'text-indigo-400' : 'text-zinc-300'}`}>
                            {item.title}
                        </h4>
                        <div className="flex items-center gap-2">
                             <span className="text-[10px] text-zinc-500 font-mono">{item.language}</span>
                             {item.tags.slice(0, 2).map((tag, i) => (
                                <span key={i} className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">#{tag}</span>
                             ))}
                        </div>
                        
                        {/* Hover Actions */}
                        <div className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-[#09090b]/80 backdrop-blur rounded pl-1">
                             <button onClick={(e) => deleteSnippet(item.id, e)} className="p-1 hover:text-red-400 text-zinc-500"><Icons.Trash /></button>
                        </div>
                    </div>
                ))
            )}
        </div>

        {/* User / Footer */}
        <div className="h-12 border-t border-white/[0.08] flex items-center justify-between px-4 bg-zinc-900/30">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === 'Error loading data' ? 'bg-red-500' : 'bg-emerald-500'} animate-pulse`}></div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{status}</span>
            </div>
            <button onClick={() => setShowAiConfig(!showAiConfig)} className="text-zinc-500 hover:text-indigo-400 transition-colors">
                <Icons.Settings />
            </button>
        </div>
      </div>

      {/* MAIN CONTENT (RIGHT) */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0c0e12] relative">
        
        {/* Editor Toolbar */}
        <div className="h-14 border-b border-white/[0.08] flex items-center justify-between px-6 bg-[#0c0e12]/80 backdrop-blur z-10">
             <div className="flex items-center gap-4 flex-1">
                <input 
                    type="text" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    placeholder="Untitled..."
                    className="bg-transparent text-lg font-medium text-white placeholder-zinc-700 outline-none w-full max-w-md"
                />
             </div>
             
             <div className="flex items-center gap-3">
                <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-xs rounded-md px-3 py-1.5 text-zinc-300 outline-none focus:border-indigo-500/50"
                >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="python">Python</option>
                    <option value="rust">Rust</option>
                    <option value="json">JSON</option>
                    <option value="sql">SQL</option>
                </select>
                
                <div className="h-4 w-[1px] bg-white/10 mx-1"></div>

                <button 
                    onClick={() => askAI('explain')} 
                    disabled={isAiLoading}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-indigo-400 px-3 py-1.5 rounded-md hover:bg-indigo-900/10 border border-transparent hover:border-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isAiLoading ? <Icons.Spinner /> : <Icons.Brain />}
                    <span>{isAiLoading ? "Thinking..." : "Explain"}</span>
                </button>

                <button 
                    onClick={() => askAI('refactor')} 
                    disabled={isAiLoading}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-emerald-400 px-3 py-1.5 rounded-md hover:bg-emerald-900/10 border border-transparent hover:border-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isAiLoading ? <Icons.Spinner /> : <Icons.Magic />}
                    <span>{isAiLoading ? "Fixing..." : "Refactor"}</span>
                </button>
                
                <button 
                    onClick={handleSaveSnippet} 
                    className="flex items-center gap-2 text-xs font-semibold bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-md transition-colors"
                >
                    <Icons.Save /> <span>Save</span>
                </button>
             </div>
        </div>

        {/* Inputs Area (Tags) */}
        <div className="px-6 py-3 border-b border-white/[0.04]">
             <input 
                type="text" 
                value={tagsInput} 
                onChange={(e) => setTagsInput(e.target.value)} 
                placeholder="Add tags (comma separated)..."
                className="w-full bg-transparent text-sm text-zinc-400 placeholder-zinc-700 outline-none"
             />
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 relative">
            <Editor
                height="100%"
                defaultLanguage="javascript"
                language={language}
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val || "")}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 24,
                    padding: { top: 20, bottom: 20 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    renderLineHighlight: "none",
                    scrollbar: {
                        vertical: 'visible',
                        horizontal: 'visible',
                        useShadows: false,
                        verticalScrollbarSize: 8,
                    }
                }}
            />
        </div>

        {/* AI Response Panel (Collapsible Overlay) */}
        {(aiResponse || suggestedCode) && (
            <div className="absolute bottom-6 right-6 w-96 max-h-[80%] bg-[#121216] border border-indigo-500/20 shadow-2xl rounded-xl flex flex-col overflow-hidden animate-in slide-in-from-right-5 fade-in z-30">
                <div className="px-4 py-3 border-b border-white/5 bg-indigo-900/10 flex justify-between items-center">
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-2"><Icons.Brain /> AI ASSISTANT</span>
                    <div className="flex gap-2">
                        {suggestedCode && (
                            <button onClick={() => { setCode(suggestedCode); setSuggestedCode(""); }} className="text-[10px] bg-emerald-600 px-2 py-0.5 rounded text-white font-bold">Apply</button>
                        )}
                        <button onClick={() => setAiResponse("")} className="text-zinc-500 hover:text-white">&times;</button>
                    </div>
                </div>
                <div className="p-4 overflow-y-auto text-sm text-zinc-300 leading-relaxed custom-scrollbar">
                    <ReactMarkdown>{aiResponse}</ReactMarkdown>
                </div>
            </div>
        )}

        {/* Config Modal */}
        {showAiConfig && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                <div className="bg-[#09090b] w-96 p-6 rounded-xl border border-zinc-800 shadow-2xl">
                    <h3 className="text-lg font-bold text-white mb-4">AI Configuration</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-zinc-500 uppercase font-bold mb-1 block">Provider URL</label>
                            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-300 outline-none focus:border-indigo-500" />
                        </div>
                        <div>
                            <label className="text-xs text-zinc-500 uppercase font-bold mb-1 block">API Key</label>
                            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-300 outline-none focus:border-indigo-500" />
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => setShowAiConfig(false)} className="px-4 py-2 rounded text-sm text-zinc-400 hover:bg-zinc-800">Close</button>
                            <button onClick={() => setShowAiConfig(false)} className="px-4 py-2 rounded text-sm bg-indigo-600 text-white hover:bg-indigo-500">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}

export default App;