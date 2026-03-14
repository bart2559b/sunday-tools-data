import React, { useState, useMemo, useRef } from 'react';
import { 
  Search, 
  Filter, 
  Database, 
  Check, 
  X, 
  AlertCircle, 
  Info,
  FileSpreadsheet,
  Sparkles,
  Loader2,
  BrainCircuit,
  Upload,
  RefreshCw,
  Download
} from 'lucide-react';

// --- Gemini API Configuration ---
const apiKey = ""; 
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

const App = () => {
  // ข้อมูลเริ่มต้น (Default)
  const defaultData = [
  //   { id: 0, code: "GL-ATM", ms_mapping: "B24:100000:0:1:0:I:I", ms_mapping_term_type: "B24:100000:0:1:0:I:I:30", mapping: "B24:100000:0:1:0:I:I", mapping_term_type: "B24:100000:0:1:0:I:I:55", ms_gl_profile_code: "", lk_tran_code: "100000", gl_key: "0:1:0:I:I", lk_term_type_code: "55", lk_channel_reconcile_code: "B24", record_created_name: "importTxTranTLFV2Batch", txn_count: "1645", status: 'PENDING', ai_remark: null },
  //   { id: 1, code: "GL-ATM", ms_mapping: "B24:100000:0:1:0:I:I", ms_mapping_term_type: "B24:100000:0:1:0:I:I:30", mapping: "B24:100000:0:1:0:I:I", mapping_term_type: "B24:100000:0:1:0:I:I:30", ms_gl_profile_code: "GL-ATM", lk_tran_code: "100000", gl_key: "0:1:0:I:I", lk_term_type_code: "30", lk_channel_reconcile_code: "B24", record_created_name: "importTxTranTLFV2Batch", txn_count: "59704", status: 'PENDING', ai_remark: null }
   ];

  const [rows, setRows] = useState(defaultData);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [activeAiModal, setActiveAiModal] = useState(null);
  const fileInputRef = useRef(null);
  
  const [userApiKey, setUserApiKey] = useState(""); 
  const [showKey, setShowKey] = useState(false); // ไว้สำหรับซ่อน/แสดงรหัส

  // ฟังก์ชันสำหรับการ Parse CSV แบบกำหนดเอง
  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
    
    return lines.slice(1).map((line, index) => {
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const obj = { id: index, status: 'PENDING', ai_remark: null };
      
      headers.forEach((header, i) => {
        let value = matches[i] || "";
        value = value.replace(/^["']|["']$/g, '').trim();
        obj[header] = value;
      });
      return obj;
    });
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const parsedData = parseCSV(content);
      if (parsedData.length > 0) {
        setRows(parsedData);
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  };

  // ฟังก์ชันสำหรับการ Export ข้อมูลกลับเป็น CSV
  const exportToCSV = () => {
    if (rows.length === 0) return;

    // ดึง Headers ทั้งหมด (รวมคอลัมน์สถานะและ AI Remark)
    const headers = Object.keys(rows[0]).filter(k => k !== 'id');
    
    const csvContent = [
      headers.join(','), // Header line
      ...rows.map(row => 
        headers.map(header => {
          let cell = row[header] === null || row[header] === undefined ? "" : String(row[header]);
          // ใส่เครื่องหมายคำพูดครอบเพื่อรักษา Format (เช่น 0 นำหน้า) และจัดการ Comma ในข้อมูล
          return `"${cell.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `audit_result_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dynamic Color Mapping (แยกสีตาม ms_mapping)
  const colorMap = useMemo(() => {
    const uniqueMappings = [...new Set(rows.map(d => d.ms_mapping))];
    const mappingColors = {};
    uniqueMappings.forEach((val, index) => {
      const hue = (index * (360 / Math.max(uniqueMappings.length, 1))) % 360;
      mappingColors[val] = `hsl(${hue}, 85%, 94%)`;
    });
    return mappingColors;
  }, [rows]);

  // Search & Filter Logic
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const matchesSearch = Object.values(row).some(val => 
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, searchTerm, statusFilter]);

  // --- Gemini API Function Call ---
  const callGemini = async (prompt, systemPrompt = "You are a senior Software Tester expert in data validation.") => {

    if (!userApiKey) {
      alert("กรุณาใส่ Gemini API Key ก่อนใช้งานครับ 🙏");
      throw new Error("Missing API Key");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    let delay = 1000;
    for (let i = 0; i < 5; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err) {
        if (i === 4) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const analyzeDataWithAI = async () => {
    setIsAiProcessing(true);
    try {
      const sampleSize = Math.min(rows.length, 15);
      const sampleData = rows.slice(0, sampleSize).map(r => ({
        code: r.code,
        mapping: r.ms_mapping,
        term: r.lk_term_type_code,
        txn: r.txn_count
      }));

      const prompt = `Analyze this list of GL mapping records (total ${rows.length} rows) for potential anomalies. Focus on: ${JSON.stringify(sampleData)}. Summary in Thai.`;
      const result = await callGemini(prompt);
      setAiAnalysisResult(result);
      setActiveAiModal('analysis');
    } catch (error) {
      console.error(error);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const suggestStatusWithAI = async () => {
    setIsAiProcessing(true);
    try {
      const prompt = `Analyze this data structure for bank recon. Recommend which pattern looks valid (PASS) or suspicious (FAIL). Summary in Thai. Data: ${JSON.stringify(rows.slice(0, 10))}`;
      const result = await callGemini(prompt);
      setRows(prev => prev.map((r, i) => i < 15 ? { ...r, ai_remark: "✨ AI: แนะนำให้ตรวจสอบ" } : r));
      setAiAnalysisResult(result);
      setActiveAiModal('suggestion');
    } catch (error) {
      console.error(error);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleStatusChange = (id, newStatus) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, status: newStatus } : row));
  };

  const stats = {
    total: rows.length,
    filtered: filteredRows.length,
    pass: rows.filter(r => r.status === 'PASS').length,
    fail: rows.filter(r => r.status === 'FAIL').length,
    pending: rows.filter(r => r.status === 'PENDING').length
  };

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] p-4 font-sans text-[11px] overflow-hidden">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Data Audit Tool & AI Tester ✨</h1>
            <p className="text-slate-500 font-medium">จัดการข้อมูล อัปโหลด และบันทึกผลการตรวจสอบ</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
              <div className="relative">
                <input 
                  type={showKey ? "text" : "password"}
                  placeholder="ใส่ Gemini API Key ที่นี่..."
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  className="pl-3 pr-8 py-1.5 bg-slate-100 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-64 text-[10px]"
                />
                <button 
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                >
                  {showKey ? <X size={12} /> : <Database size={12} />}
                </button>
              </div>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="text-indigo-500 hover:underline font-bold text-[9px]"
              >
                รับ API Key คลิก
              </a>
            </div>
        </div>
        

        

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 justify-end">
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          
          <button 
            onClick={() => fileInputRef.current.click()}
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all"
          >
            <Upload size={16} className="text-indigo-600" />
            อัปโหลด CSV
          </button>

          <button 
            onClick={exportToCSV}
            disabled={rows.length === 0}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-all"
          >
            <Download size={16} />
            Export ผลการตรวจ (CSV)
          </button>

          <button 
            onClick={analyzeDataWithAI}
            disabled={isAiProcessing || rows.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {isAiProcessing ? <Loader2 className="animate-spin" size={16} /> : <BrainCircuit size={16} />}
            วิเคราะห์ AI ✨
          </button>
          
          <button 
            onClick={suggestStatusWithAI}
            disabled={isAiProcessing || rows.length === 0}
            className="flex items-center gap-2 bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-indigo-50 disabled:opacity-50 transition-all"
          >
            {isAiProcessing ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            AI แนะนำ ✨
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white px-5 py-3 rounded-t-2xl border-x border-t border-slate-200 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="ค้นหาข้อมูลทุกคอลัมน์..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
          <StatBadge label="Total" value={stats.total} color="bg-white text-slate-600" />
          <StatBadge label="Pass" value={stats.pass} color="bg-emerald-500 text-white" />
          <StatBadge label="Fail" value={stats.fail} color="bg-rose-500 text-white" />
          <StatBadge label="Pending" value={stats.pending} color="bg-amber-400 text-white" />
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto bg-white border-x border-b border-slate-200 shadow-sm rounded-b-2xl relative">
        <table className="w-full text-left border-collapse min-w-[2200px]">
          <thead className="sticky top-0 z-40 bg-slate-900 text-slate-200 text-[10px] font-bold uppercase tracking-wider">
            <tr>
              <th className="p-4 sticky left-0 bg-slate-950 z-50 w-44 shadow-[4px_0_10px_rgba(0,0,0,0.2)]">Status Control</th>
              <th className="p-4">AI Remark ✨</th>
              <th className="p-4 border-r border-slate-700">Code</th>
              <th className="p-4 border-r border-slate-700 min-w-[280px]">MS Mapping (Group)</th>
              <th className="p-4 border-r border-slate-700 text-center">Term Type</th>
              <th className="p-4 border-r border-slate-700 text-center">GL Key</th>
              <th className="p-4 border-r border-slate-700 text-right">TXN Count</th>
              <th className="p-4 border-r border-slate-700 text-center">Reconcile CH</th>
              <th className="p-4">Mapping Term Type</th>
              <th className="p-4">Process Batch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-indigo-50/30 transition-colors group">
                  <td className="p-3 sticky left-0 bg-white group-hover:bg-[#fdfdfe] z-30 shadow-[4px_0_10px_rgba(0,0,0,0.03)]">
                    <div className="flex gap-1 items-center">
                      <button 
                        onClick={() => handleStatusChange(row.id, 'PASS')}
                        className={`p-1.5 rounded-lg border transition-all ${row.status === 'PASS' ? 'bg-emerald-500 border-emerald-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-300 hover:text-emerald-500'}`}
                      >
                        <Check size={14} />
                      </button>
                      <button 
                        onClick={() => handleStatusChange(row.id, 'FAIL')}
                        className={`p-1.5 rounded-lg border transition-all ${row.status === 'FAIL' ? 'bg-rose-500 border-rose-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-300 hover:text-rose-500'}`}
                      >
                        <X size={14} />
                      </button>
                      <select 
                        value={row.status}
                        onChange={(e) => handleStatusChange(row.id, e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg font-black text-[9px] outline-none border border-slate-100 bg-slate-50 cursor-pointer"
                      >
                        <option value="PENDING">WAIT</option>
                        <option value="PASS">PASS</option>
                        <option value="FAIL">FAIL</option>
                      </select>
                    </div>
                  </td>
                  <td className="p-4">
                    {row.ai_remark ? (
                      <span className="flex items-center gap-1.5 text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100 animate-pulse">
                        <Sparkles size={10} />
                        {row.ai_remark}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="p-4 font-bold text-slate-800 border-r border-slate-50">{row.code || "-"}</td>
                  <td 
                    className="p-4 font-mono transition-all border-r border-slate-100"
                    style={{ backgroundColor: colorMap[row.ms_mapping] || '#fff' }}
                  >
                    <span className="bg-white/80 px-2.5 py-1 rounded-md border border-slate-300 shadow-sm block w-fit font-bold text-slate-700">
                      {row.ms_mapping || "-"}
                    </span>
                  </td>
                  <td className="p-4 text-center border-r border-slate-50">
                    <span className="font-mono text-indigo-700 font-black bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 text-[11px]">
                      {row.lk_term_type_code || "-"}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-slate-400 italic text-center border-r border-slate-50">
                    {row.gl_key || "-"}
                  </td>
                  <td className="p-4 text-right border-r border-slate-50">
                    <span className="font-mono font-bold text-slate-800 tabular-nums">
                      {Number(row.txn_count || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="p-4 text-center border-r border-slate-50">
                    <span className="bg-slate-800 text-white px-3 py-1 rounded font-black text-[9px]">
                      {row.lk_channel_reconcile_code || "-"}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-[9px] text-slate-400 max-w-[200px] truncate hover:whitespace-normal border-r border-slate-50">
                    {row.ms_mapping_term_type || "-"}
                  </td>
                  <td className="p-4 text-slate-400 italic text-[10px]">{row.record_created_name || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" className="p-20 text-center text-slate-400 font-bold bg-slate-50/50">
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle size={40} className="text-slate-200" />
                    ไม่มีข้อมูลแสดงผล กรุณาอัปโหลดไฟล์ CSV
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* AI Modals */}
      {activeAiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Sparkles size={24} />
                <h2 className="text-xl font-bold">AI Audit Results ✨</h2>
              </div>
              <button onClick={() => setActiveAiModal(null)} className="p-2 hover:bg-white/20 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 overflow-auto text-slate-700 leading-relaxed font-medium">
              <div className="whitespace-pre-wrap">{aiAnalysisResult}</div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end">
              <button onClick={() => setActiveAiModal(null)} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold">เข้าใจแล้ว</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Info size={14} className="text-indigo-500" />
          <span><b>Audit Note:</b> รองรับการอัปโหลด CSV ใหม่และ Export ผลการตรวจสอบกลับออกมาเป็นไฟล์ได้ทันที</span>
        </div>
        <div className="flex items-center gap-2 font-black text-indigo-400 uppercase tracking-widest">
          <RefreshCw size={12} className={isAiProcessing ? "animate-spin" : ""} />
          DATA-INTELLIGENCE v3.1
        </div>
      </div>
    </div>
  );
};

const StatBadge = ({ label, value, color }) => (
  <div className={`px-4 py-1.5 rounded-lg flex items-center gap-2 shadow-sm ${color}`}>
    <span className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</span>
    <span className="text-sm font-black">{value}</span>
  </div>
);

export default App;