import { useState, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
          setStatus("Data loaded");
        } else {
            setStatus("Ready");
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
      setStatus("Failed to save");
    }
  };

  const handleSaveSnippet = () => {
    if (!title || !code) {
        setStatus("Title & Code required!");
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
        setStatus("Updated! ✅");
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
        setStatus("Saved! 💾");
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setTitle("");
    setCode("");
    setTagsInput("");
    setEditingId(null);
    setStatus("Cancelled");
  };

  const deleteSnippet = (id: number) => {
    if (window.confirm("Hapus snippet ini?")) {
        const updatedSnippets = snippets.filter((s) => s.id !== id);
        setSnippets(updatedSnippets);
        saveDataToDisk(updatedSnippets);
        if (editingId === id) cancelEdit();
        setStatus("Deleted 🗑️");
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setStatus("Copied! 📋");
    setTimeout(() => setStatus("Ready"), 1500);
  };

  const askAI = async (mode: 'explain' | 'refactor') => {
    if (!apiKey) {
      setShowAiConfig(true);
      return alert("Set API Key dulu!");
    }
    if (!code) return alert("Kode kosong!");

    setIsAiLoading(true);
    setAiResponse("");
    setSuggestedCode("");
    setStatus(mode === 'refactor' ? "AI Fixing..." : "AI Explaining...");

    try {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
      const ENDPOINT = `${cleanBaseUrl}/chat/completions`;

      const systemPrompt = mode === 'refactor'
        ? "Kamu adalah Senior Developer. Perbaiki, optimasi, dan rapikan kode berikut. BERIKAN HANYA KODE HASIL PERBAIKAN DALAM FORMAT MARKDOWN CODE BLOCK."
        : "Jelaskan kode berikut secara singkat. Jika ada error, sebutkan.";

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
            { role: "user", content: `Bahasa: ${language}\n\nKode:\n${code}` }
          ],
          temperature: 0.5,
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error?.message || "Gagal");

      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        setAiResponse(content);
        setStatus("AI Done");

        if (mode === 'refactor') {
            const codeBlockRegex = /```(?:[\w]*\n)?([\s\S]*?)```/;
            const match = content.match(codeBlockRegex);
            if (match && match[1]) {
                setSuggestedCode(match[1].trim());
            }
        }

      } else {
        setAiResponse("Tidak ada respons.");
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
        setStatus("Code Applied! ✨");
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
    <div className="h-screen w-full bg-[#1e1e1e] text-white flex flex-col p-4 overflow-hidden font-sans">
      <header className="mb-4 border-b border-gray-700 pb-3 flex justify-between items-center">
        <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-blue-500 tracking-tight">
            DevMind <span className="text-gray-500 text-sm font-normal">v2.0 Pro</span>
            </h1>
            <button
                onClick={() => setShowAiConfig(!showAiConfig)}
                className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded border border-gray-600 transition-colors"
            >
                ⚙️ {showAiConfig ? "Hide" : "Config"}
            </button>
        </div>
        <span className="text-xs text-gray-400 font-mono bg-gray-800 px-3 py-1 rounded">
          {status}
        </span>
      </header>

      {showAiConfig && (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 mb-4 flex flex-col gap-2 shadow-lg z-50">
            <input type="text" placeholder="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="bg-gray-900 px-2 py-1 rounded text-sm border border-gray-700" />
            <input type="password" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="bg-gray-900 px-2 py-1 rounded text-sm border border-gray-700" />
        </div>
      )}

      <div className="flex-1 grid grid-cols-12 gap-4 h-full overflow-hidden">
        <div className="col-span-7 flex flex-col gap-3 h-full overflow-hidden">
          <div className="flex gap-2">
            <input
                type="text" placeholder="Judul Snippet"
                className="bg-gray-800 p-2.5 rounded border border-gray-700 focus:border-blue-500 flex-1 outline-none text-sm"
                value={title} onChange={(e) => setTitle(e.target.value)}
            />
            <select
                className="bg-gray-800 p-2.5 rounded border border-gray-700 focus:border-blue-500 cursor-pointer outline-none text-sm w-32"
                value={language} onChange={(e) => setLanguage(e.target.value)}
            >
                <option value="javascript">JS</option>
                <option value="typescript">TS</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="sql">SQL</option>
                <option value="json">JSON</option>
            </select>
          </div>

          <input
            type="text" placeholder="Tags (pisahkan koma): react, api, helper..."
            className="bg-gray-800 p-2.5 rounded border border-gray-700 focus:border-blue-500 outline-none text-sm w-full"
            value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
          />

          <div className={`flex-1 rounded-lg overflow-hidden border ${editingId ? 'border-yellow-500' : 'border-gray-700'}`}>
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
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16, bottom: 16 }
                }}
            />
          </div>

          <div className="flex gap-2">
            {editingId && (
                <button onClick={cancelEdit} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold">Batal</button>
            )}
            <button
                onClick={handleSaveSnippet}
                className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${editingId ? "bg-yellow-600 hover:bg-yellow-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
                {editingId ? "Update" : "Simpan"}
            </button>

            <div className="flex gap-1 bg-gray-800 p-1 rounded border border-gray-700">
                <button
                    onClick={() => askAI('explain')}
                    disabled={isAiLoading}
                    className="px-3 py-1 bg-purple-900/50 hover:bg-purple-800 text-purple-200 text-xs rounded border border-purple-700 transition-colors"
                >
                    {isAiLoading ? "..." : "Explain"}
                </button>
                <button
                    onClick={() => askAI('refactor')}
                    disabled={isAiLoading}
                    className="px-3 py-1 bg-green-900/50 hover:bg-green-800 text-green-200 text-xs rounded border border-green-700 transition-colors"
                >
                    {isAiLoading ? "..." : "Fix & Refactor"}
                </button>
            </div>
          </div>

          {(aiResponse || suggestedCode) && (
            <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-gray-400">AI Response:</span>
                    <div className="flex gap-2">
                        {suggestedCode && (
                            <button
                                onClick={applyAiFix}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded flex items-center gap-1"
                            >
                                ✅ Apply Code
                            </button>
                        )}
                        <button onClick={() => {setAiResponse(""); setSuggestedCode("");}} className="text-xs text-red-400 hover:text-red-300">Close</button>
                    </div>
                </div>
                <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {aiResponse}
                </div>
            </div>
          )}
        </div>

        <div className="col-span-5 flex flex-col gap-3 h-full overflow-hidden">
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
            <input
              type="text" placeholder="Cari kode, judul, atau #tag..."
              className="w-full bg-gray-800 border border-gray-700 text-white pl-9 pr-3 py-2 rounded outline-none focus:border-blue-500 text-sm"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-3">
            {filteredSnippets.length === 0 ? (
              <p className="text-center text-gray-500 text-sm mt-10 italic">Tidak ditemukan.</p>
            ) : (
              filteredSnippets.map((item) => (
                <div key={item.id} className={`bg-[#252526] rounded-lg border overflow-hidden shadow-sm group hover:border-blue-500/50 transition-all ${editingId === item.id ? "border-yellow-500 ring-1 ring-yellow-500/30" : "border-gray-700"}`}>
                  <div className="px-3 py-2 border-b border-gray-700/50 flex justify-between items-start bg-[#2d2d2d]">
                    <div className="overflow-hidden mr-2">
                        <h3 className="font-bold text-blue-400 text-sm truncate mb-1">{item.title}</h3>
                        <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 rounded border border-gray-600">{item.language}</span>
                            {item.tags.map((tag, idx) => (
                                <span key={idx} className="text-[10px] bg-blue-900/30 text-blue-300 px-1.5 rounded border border-blue-800/50">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit(item)} className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-yellow-400">✏️</button>
                      <button onClick={() => copyToClipboard(item.code)} className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-green-400">📋</button>
                      <button onClick={() => deleteSnippet(item.id)} className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400">🗑️</button>
                    </div>
                  </div>

                  <div className="max-h-32 overflow-hidden relative">
                    <SyntaxHighlighter
                        language={item.language}
                        style={vscDarkPlus}
                        customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.75rem', background: 'transparent' }}
                    >
                        {item.code}
                    </SyntaxHighlighter>
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#252526] to-transparent pointer-events-none"></div>
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