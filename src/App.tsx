import { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Kita pakai Document, folder yang pasti aman dan ada.
import { writeTextFile, readTextFile, BaseDirectory, exists } from '@tauri-apps/plugin-fs';

interface Snippet {
  id: number;
  title: string;
  code: string;
  language: string;
}

const FILE_NAME = 'devmind_data.json';

function App() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [status, setStatus] = useState("Ready");

  // 1. LOAD DATA (Dari Documents)
  useEffect(() => {
    async function loadData() {
      try {
        // Cek file di Documents
        const fileExists = await exists(FILE_NAME, { dir: BaseDirectory.Document });
        
        if (fileExists) {
          const content = await readTextFile(FILE_NAME, { dir: BaseDirectory.Document });
          setSnippets(JSON.parse(content));
          setStatus("Data loaded from Documents");
        } else {
            setStatus("Ready (New File)");
        }
      } catch (err) {
        console.error("Load Error:", err);
        setStatus("Error loading data");
      }
    }
    loadData();
  }, []);

  // 2. SAVE DATA (Langsung ke Documents)
  const saveDataToDisk = async (newSnippets: Snippet[]) => {
    try {
      // Simpan langsung. Tidak perlu mkdir karena folder Documents pasti ada.
      await writeTextFile(FILE_NAME, JSON.stringify(newSnippets), { 
        dir: BaseDirectory.Document 
      });
      
      setStatus("Saved to Documents!");
      setTimeout(() => setStatus("Ready"), 2000);
    } catch (err) {
      console.error("Gagal menyimpan:", err);
      setStatus("Failed to save data");
    }
  };

  const addSnippet = () => {
    if (!title || !code) {
        setStatus("Title & Code cannot be empty!");
        setTimeout(() => setStatus("Ready"), 2000);
        return;
    }

    const newSnippet: Snippet = {
      id: Date.now(),
      title,
      code,
      language,
    };

    const updatedSnippets = [newSnippet, ...snippets];
    setSnippets(updatedSnippets);
    saveDataToDisk(updatedSnippets);
    
    setTitle("");
    setCode("");
  };

  return (
    <div className="h-screen w-full bg-gray-900 text-white flex flex-col p-6 overflow-hidden">
      
      <header className="mb-6 border-b border-gray-700 pb-4 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-blue-500 tracking-tight">
          DevMind <span className="text-gray-500 text-lg font-normal">v0.5</span>
        </h1>
        <span className="text-xs text-gray-500 font-mono border border-gray-700 px-2 py-1 rounded">
          Status: {status}
        </span>
      </header>

      <div className="flex-1 grid grid-cols-2 gap-6 h-full overflow-hidden">
        
        <div className="flex flex-col gap-4 bg-gray-800 p-4 rounded-xl border border-gray-700">
          <input
            type="text"
            placeholder="Judul Snippet"
            className="bg-gray-700 p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <select 
            className="bg-gray-700 p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="tsx">React (TSX)</option>
            <option value="css">CSS / Tailwind</option>
            <option value="python">Python</option>
            <option value="sql">SQL</option>
            <option value="bash">Terminal / Bash</option>
          </select>
          
          <textarea
            placeholder="Paste kodemu di sini..."
            className="flex-1 bg-gray-700 p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
          
          <button
            onClick={addSnippet}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition-colors"
          >
            Simpan ke Documents
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {snippets.length === 0 ? (
            <p className="text-gray-500 italic">Data kosong.</p>
          ) : (
            snippets.map((item) => (
              <div key={item.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
                <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                  <h3 className="font-bold text-blue-300 text-sm">{item.title}</h3>
                  <span className="text-xs bg-gray-900 px-2 py-1 rounded text-gray-400 uppercase">
                    {item.language}
                  </span>
                </div>
                
                <SyntaxHighlighter 
                  language={item.language} 
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, padding: '1rem', fontSize: '0.85rem' }}
                >
                  {item.code}
                </SyntaxHighlighter>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}

export default App;