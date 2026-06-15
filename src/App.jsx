import { useEffect, useState, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Area
} from 'recharts';
import toast, { Toaster } from 'react-hot-toast';
import html2pdf from 'html2pdf.js';
import api from './services/api';
import "./index.css";

function App() {
  const [allSheets, setAllSheets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSheet, setActiveSheet] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editingRowNumber, setEditingRowNumber] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAllBooks, setIsAllBooks] = useState(false);
  const [formData, setFormData] = useState({});
  const [availableSheets, setAvailableSheets] = useState([]);
  const [selectedSheetForAdd, setSelectedSheetForAdd] = useState("");
  const [addFormHeaders, setAddFormHeaders] = useState([]);
  const [printData, setPrintData] = useState({
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    pageNumber: '',
    bookNumber: '',
    issuedTo: '',
    asstRegistrationOfficer: '',
    municipalCivilRegistrar: '',
    orNumber: '',
    amountPaid: '',
    datePaid: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  });
 
  const printRef = useRef();

  useEffect(() => {
    fetchAllSheets();
  }, []);

  const fetchAllSheets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getAllSheets();
      if (response.success) {
        setAllSheets({ sheets: response.sheets, totalSheets: response.totalSheets });
        setAvailableSheets(Object.keys(response.sheets));
        if (response.fromCache) {
          toast.success("Data loaded from cache", { duration: 2000 });
        }
      } else {
        throw new Error(response.error);
      }
    } catch (err) {
      console.error("Fetch all sheets failed:", err);
      setError(err.message);
      toast.error("Failed to load data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSpecificSheet = async (sheetName) => {
    try {
      setLoading(true);
      setError(null);
      setIsAllBooks(false);
      const response = await api.getSheetData(sheetName);
      if (response.success) {
        const data = [response.headers, ...response.data];
        setActiveSheet({ name: sheetName, data: data });
        setActiveView("sheet");
        setSelectedMonth("all");
        setSearchTerm("");
        if (response.fromCache) {
          toast.success(`Loaded ${sheetName} from cache`, { duration: 1500 });
        }
      } else {
        throw new Error(response.error);
      }
    } catch (err) {
      console.error(`Fetch sheet "${sheetName}" failed:`, err);
      setError(err.message);
      toast.error(`Failed to load ${sheetName}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllBooks = async () => {
    if (!allSheets || !allSheets.sheets) {
      toast.error("No data available");
      return;
    }
    toast.loading("Loading all registry books...", { id: "all-books" });
    const allData = [];
    let headers = null;
    const sortedSheets = Object.keys(allSheets.sheets).sort();
    for (const sheetName of sortedSheets) {
      const sheetData = allSheets.sheets[sheetName];
      if (sheetData && sheetData.data && sheetData.data.length > 0) {
        if (!headers) {
          headers = ['Book Name', ...(sheetData.headers || [])];
        }
        for (let i = 0; i < sheetData.data.length; i++) {
          const row = [sheetName, ...(sheetData.data[i] || [])];
          allData.push(row);
        }
      }
    }
    if (headers && allData.length > 0) {
      const combinedData = [headers, ...allData];
      setActiveSheet({ name: "ALL REGISTRY BOOKS", data: combinedData });
      setActiveView("sheet");
      setIsAllBooks(true);
      setSelectedMonth("all");
      setSearchTerm("");
      toast.success(`Loaded ${sortedSheets.length} books with ${allData.length} records`, { id: "all-books" });
    } else {
      console.error("No data available for All Books view");
      toast.error("Unable to load All Registry Books.", { id: "all-books" });
    }
  };

  const goToDashboard = () => {
    setActiveView("dashboard");
    setActiveSheet(null);
    setSelectedMonth("all");
    setSearchTerm("");
    setIsAllBooks(false);
  };

  const openModal = (record) => {
    setSelectedRecord(record);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedRecord(null);
  };

  const openPrintModal = (record) => {
    const childName = record.fullRecord.find((_, idx) =>
      record.headers?.[idx]?.toLowerCase().includes('name of child')
    ) || "Unknown";
    const pageNumber = record.fullRecord.find((_, idx) =>
      record.headers?.[idx]?.toLowerCase().includes('page')
    ) || '';
    const bookNumber = record.fullRecord.find((_, idx) =>
      record.headers?.[idx]?.toLowerCase().includes('book')
    ) || '';
    setPrintData({ ...printData, issuedTo: childName, pageNumber: pageNumber, bookNumber: bookNumber });
    setSelectedRecord(record);
    setIsPrintModalOpen(true);
  };

  const closePrintModal = () => {
    setIsPrintModalOpen(false);
    setSelectedRecord(null);
  };

  const handlePrintInputChange = (field, value) => {
    setPrintData({ ...printData, [field]: value });
  };

  const generatePDF = () => {
    const element = printRef.current;
    const opt = {
      margin: [0.2, 0.2, 0.2, 0.2],
      filename: `birth_certificate_${printData.issuedTo.replace(/\s/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, letterRendering: true, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
    toast.success("PDF generated successfully!");
    closePrintModal();
  };

  const capitalizeText = (text, header) => {
    if (!text) return '';
    if (header && (header.toLowerCase().includes('lcr') || header.toLowerCase().includes('registry number'))) {
      return text;
    }
    return text.toString().toUpperCase();
  };

  const isDateField = (header) => {
    const dateKeywords = ['date of registration', 'date of birth', 'date of marriage'];
    return dateKeywords.some(keyword => header.toLowerCase().includes(keyword));
  };

  const isSexField = (header) => {
    return header.toLowerCase().includes('sex') || header.toLowerCase().includes('gender');
  };

  const processFormData = (data, headersList) => {
    const processed = {};
    Object.keys(data).forEach(key => {
      let value = data[key];
      if (!value || value.trim() === '') {
        processed[key] = 'NOT STATED';
      } else {
        processed[key] = capitalizeText(value, key);
      }
    });
    return processed;
  };

  const openAddModal = () => {
    setFormData({});
    if (isAllBooks) {
      setSelectedSheetForAdd("");
      setAddFormHeaders([]);
      setIsAddModalOpen(true);
    } else {
      const headers = activeSheet?.data?.[0] || [];
      const emptyForm = {};
      headers.forEach(header => { emptyForm[header] = ''; });
      setFormData(emptyForm);
      setSelectedSheetForAdd(activeSheet?.name || "");
      setIsAddModalOpen(true);
    }
  };

  const handleSheetSelectionChange = async (sheetName) => {
    if (!sheetName) {
      setAddFormHeaders([]);
      setSelectedSheetForAdd("");
      return;
    }
    toast.loading(`Loading ${sheetName}...`, { id: "sheet-load" });
    try {
      const response = await api.getSheetData(sheetName);
      if (response.success && response.headers) {
        setAddFormHeaders(response.headers);
        setSelectedSheetForAdd(sheetName);
        const emptyForm = {};
        response.headers.forEach(header => { emptyForm[header] = ''; });
        setFormData(emptyForm);
        toast.success(`Ready to add record to ${sheetName}`, { id: "sheet-load", duration: 1500 });
      }
    } catch (err) {
      console.error("Error fetching sheet headers:", err);
      toast.error("Could not load sheet data.", { id: "sheet-load" });
    }
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setFormData({});
    setSelectedSheetForAdd("");
    setAddFormHeaders([]);
  };

  const handleAddRecord = async () => {
    try {
      const sheetName = selectedSheetForAdd;
      if (!sheetName) {
        toast.error("Please select a registry book");
        return;
      }
      toast.loading("Saving record...", { id: "add-record" });
      const headersList = isAllBooks ? addFormHeaders : (activeSheet?.data?.[0] || []);
      const processedData = processFormData(formData, headersList);
      const response = await api.addRecord(sheetName, processedData);
      if (response.success) {
        toast.success(`Record added successfully to ${sheetName}!`, { id: "add-record" });
        closeAddModal();
        if (isAllBooks) {
          await fetchAllBooks();
        } else if (activeSheet) {
          await fetchSpecificSheet(activeSheet.name);
        }
        await fetchAllSheets();
      } else {
        toast.error("Error: " + response.error, { id: "add-record" });
      }
    } catch (err) {
      toast.error("Error adding record: " + err.message, { id: "add-record" });
    }
  };

  const openEditModal = (record, rowNumber) => {
    if (record && record.fullRecord && record.headers) {
      const recordObject = {};
      record.headers.forEach((header, idx) => {
        let value = record.fullRecord[idx] || '';
        if (value === 'NOT STATED') value = '';
        recordObject[header] = value;
      });
      setEditingRecord({ ...record, fullRecord: recordObject, originalFullRecord: record.fullRecord });
      setEditingRowNumber(rowNumber);
      setIsEditModalOpen(true);
    } else {
      console.error("Invalid record data:", record);
      toast.error("Error loading record data for editing");
    }
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingRecord(null);
    setEditingRowNumber(null);
  };

  const handleUpdateRecord = async () => {
    try {
      const sheetName = isAllBooks ? editingRecord.bookName : activeSheet?.name;
      if (sheetName === 'ALL' || !sheetName) {
        toast.error("Please select a specific book to edit records");
        return;
      }
      toast.loading("Updating record...", { id: "update-record" });
      const processedRecord = {};
      Object.keys(editingRecord.fullRecord).forEach(key => {
        let value = editingRecord.fullRecord[key];
        if (!value || value.trim() === '') {
          processedRecord[key] = 'NOT STATED';
        } else {
          processedRecord[key] = capitalizeText(value, key);
        }
      });
      const headers = editingRecord.headers;
      const recordArray = [];
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        if (isAllBooks && header === 'Book Name') continue;
        recordArray.push(processedRecord[header] || 'NOT STATED');
      }
      const response = await api.updateRecord(sheetName, editingRowNumber, recordArray);
      if (response.success) {
        toast.success("Record updated successfully!", { id: "update-record" });
        closeEditModal();
        if (isAllBooks) {
          await fetchAllBooks();
        } else {
          await fetchSpecificSheet(sheetName);
        }
        await fetchAllSheets();
      } else {
        toast.error("Error: " + response.error, { id: "update-record" });
      }
    } catch (err) {
      toast.error("Error updating record: " + err.message, { id: "update-record" });
    }
  };

  const handleDeleteRecord = async (sheetName, rowNumber) => {
    if (!confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
      return;
    }
    toast.loading("Deleting record...", { id: "delete-record" });
    try {
      const response = await api.deleteRecord(sheetName, rowNumber);
      if (response.success) {
        toast.success("Record deleted successfully!", { id: "delete-record" });
        closeEditModal();
        await fetchSpecificSheet(sheetName);
      } else {
        toast.error("Error: " + response.error, { id: "delete-record" });
      }
    } catch (err) {
      toast.error("Error deleting record: " + err.message, { id: "delete-record" });
    }
  };

  const refreshData = async () => {
    setLoading(true);
    toast.loading("Refreshing data...", { id: "refresh" });
    try {
      await fetchAllSheets();
      if (activeView === "sheet" && activeSheet && !isAllBooks && activeSheet.name !== "ALL REGISTRY BOOKS") {
        await fetchSpecificSheet(activeSheet.name);
      } else if (isAllBooks) {
        await fetchAllBooks();
      }
      toast.success("Data refreshed successfully!", { id: "refresh", duration: 2000 });
    } catch (err) {
      console.error("Refresh failed:", err);
      toast.error("Refresh failed: " + err.message, { id: "refresh" });
    } finally {
      setLoading(false);
    }
  };

  const getSheetNames = () => {
    if (!allSheets || !allSheets.sheets) return [];
    return Object.keys(allSheets.sheets).sort();
  };

  const getDashboardStats = () => {
    if (!allSheets || !allSheets.sheets) return { totalSheets: 0, totalRecords: 0, recentSheets: [] };
    const sheets = allSheets.sheets;
    const sheetNames = Object.keys(sheets);
    let totalRecords = 0;
    sheetNames.forEach(sheetName => {
      totalRecords += sheets[sheetName].totalRecords || 0;
    });
    const recentSheets = [...sheetNames].sort().reverse().slice(0, 5);
    return { totalSheets: sheetNames.length, totalRecords, recentSheets };
  };

  const extractMonth = (dateString) => {
    if (!dateString) return null;
    const months = {
      'JANUARY': 1, 'JAN': 1,
      'FEBRUARY': 2, 'FEB': 2,
      'MARCH': 3, 'MAR': 3,
      'APRIL': 4, 'APR': 4,
      'MAY': 5,
      'JUNE': 6, 'JUN': 6,
      'JULY': 7, 'JUL': 7,
      'AUGUST': 8, 'AUG': 8,
      'SEPTEMBER': 9, 'SEP': 9,
      'OCTOBER': 10, 'OCT': 10,
      'NOVEMBER': 11, 'NOV': 11,
      'DECEMBER': 12, 'DEC': 12
    };
    const upperDate = dateString.toUpperCase();
    for (const [monthName, monthNum] of Object.entries(months)) {
      if (upperDate.includes(monthName)) {
        return monthNum;
      }
    }
    return null;
  };

  const matchesSearch = (row, searchTerm) => {
    if (!searchTerm || searchTerm.trim() === "") return true;
    const term = searchTerm.toLowerCase().trim();
    return row.some(cell => cell && cell.toString().toLowerCase().includes(term));
  };

  const getDisplayRows = (data) => {
    if (!data || data.length <= 1) return [];
    const headers = data[0] || [];
    const rows = data.slice(1);
    let bookIndex, pageIndex, lcrIndex, regDateIndex, childNameIndex;
    if (isAllBooks) {
      const originalHeaders = headers.slice(1);
      const originalBookIndex = originalHeaders.findIndex(h => h?.toString().toLowerCase().includes('book') && !h?.toString().toLowerCase().includes('book name'));
      const originalPageIndex = originalHeaders.findIndex(h => h?.toString().toLowerCase().includes('page'));
      const originalLcrIndex = originalHeaders.findIndex(h => h?.toString().toLowerCase().includes('lcr') || h?.toString().toLowerCase().includes('registry'));
      const originalRegDateIndex = originalHeaders.findIndex(h => h?.toString().toLowerCase().includes('date of registration'));
      const originalChildNameIndex = originalHeaders.findIndex(h => h?.toString().toLowerCase().includes('name of child'));
      bookIndex = originalBookIndex !== -1 ? originalBookIndex + 1 : -1;
      pageIndex = originalPageIndex !== -1 ? originalPageIndex + 1 : -1;
      lcrIndex = originalLcrIndex !== -1 ? originalLcrIndex + 1 : -1;
      regDateIndex = originalRegDateIndex !== -1 ? originalRegDateIndex + 1 : -1;
      childNameIndex = originalChildNameIndex !== -1 ? originalChildNameIndex + 1 : -1;
    } else {
      bookIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('book') && !h?.toString().toLowerCase().includes('book name'));
      pageIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('page'));
      lcrIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('lcr') || h?.toString().toLowerCase().includes('registry'));
      regDateIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('date of registration'));
      childNameIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('name of child'));
    }
    let filteredRows = rows;
    if (selectedMonth !== "all" && regDateIndex !== -1) {
      filteredRows = filteredRows.filter(row => {
        const registrationDate = row[regDateIndex];
        const month = extractMonth(registrationDate);
        return month === parseInt(selectedMonth);
      });
    }
    if (searchTerm && searchTerm.trim() !== "") {
      filteredRows = filteredRows.filter(row => matchesSearch(row, searchTerm));
    }
    return filteredRows.map((row, idx) => {
      const originalIndex = rows.findIndex(r => r === row);
      const rowNumber = originalIndex + 2;
      return {
        bookName: isAllBooks && row[0] ? row[0] : null,
        book: bookIndex !== -1 ? (row[bookIndex] || '') : '',
        page: pageIndex !== -1 ? (row[pageIndex] || '') : '',
        lcrNumber: lcrIndex !== -1 ? (row[lcrIndex] || '') : '',
        registrationDate: regDateIndex !== -1 ? (row[regDateIndex] || '') : '',
        childName: childNameIndex !== -1 ? (row[childNameIndex] || '') : '',
        fullRecord: row,
        headers: headers,
        rowNumber: rowNumber
      };
    });
  };

  const getAvailableMonths = (data) => {
    if (!data || data.length <= 1) return [];
    const headers = data[0] || [];
    const rows = data.slice(1);
    let regDateIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('date of registration'));
    if (isAllBooks && regDateIndex !== -1) {
      regDateIndex = regDateIndex + 1;
    }
    if (regDateIndex === -1) return [];
    const monthsSet = new Set();
    rows.forEach(row => {
      const registrationDate = row[regDateIndex];
      const month = extractMonth(registrationDate);
      if (month) monthsSet.add(month);
    });
    const monthNames = {
      1: 'January', 2: 'February', 3: 'March', 4: 'April',
      5: 'May', 6: 'June', 7: 'July', 8: 'August',
      9: 'September', 10: 'October', 11: 'November', 12: 'December'
    };
    return Array.from(monthsSet).sort((a, b) => a - b).map(month => ({ value: month, label: monthNames[month] }));
  };

  const getMonthlyDistribution = () => {
    if (!allSheets || !allSheets.sheets) return [];
    const monthCount = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    Object.keys(allSheets.sheets).forEach(sheetName => {
      const sheetData = allSheets.sheets[sheetName];
      if (sheetData && sheetData.data) {
        const headers = sheetData.headers;
        const regDateIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('date of registration'));
        for (let i = 0; i < sheetData.data.length; i++) {
          const dateStr = sheetData.data[i][regDateIndex];
          const month = extractMonth(dateStr);
          if (month) monthCount[month] = (monthCount[month] || 0) + 1;
        }
      }
    });
    return monthNames.map((name, index) => ({ month: name, registrations: monthCount[index + 1] || 0 }));
  };

  const getYearlyDistribution = () => {
    if (!allSheets || !allSheets.sheets) return [];
    const yearCount = {};
    Object.keys(allSheets.sheets).forEach(sheetName => {
      const yearMatch = sheetName.match(/\d{4}/);
      if (yearMatch) {
        const year = yearMatch[0];
        const recordCount = allSheets.sheets[sheetName].totalRecords || 0;
        yearCount[year] = (yearCount[year] || 0) + recordCount;
      }
    });
    return Object.entries(yearCount).sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count }));
  };

  const getGenderDistribution = () => {
    if (!allSheets || !allSheets.sheets) return [];
    let male = 0, female = 0;
    Object.keys(allSheets.sheets).forEach(sheetName => {
      const sheetData = allSheets.sheets[sheetName];
      if (sheetData && sheetData.data && sheetData.data.length > 0) {
        const headers = sheetData.headers;
        let sexIndex = -1;
        for (let i = 0; i < headers.length; i++) {
          const headerLower = headers[i]?.toString().toLowerCase().trim();
          if (headerLower === 'sex' || headerLower === 'gender' || (headerLower && headerLower.includes('sex'))) {
            sexIndex = i;
            break;
          }
        }
        if (sexIndex !== -1) {
          for (let i = 0; i < sheetData.data.length; i++) {
            const sexValue = sheetData.data[i][sexIndex];
            if (sexValue) {
              const sex = sexValue.toString().trim().toUpperCase();
              if (sex === 'MALE' || sex === 'M' || sex.includes('MALE')) {
                male++;
              } else if (sex === 'FEMALE' || sex === 'F' || sex.includes('FEMALE')) {
                female++;
              }
            }
          }
        }
      }
    });
    if (male === 0 && female === 0) {
      return [{ name: 'No Data', value: 1, color: '#9ca3af' }];
    }
    return [{ name: 'Male', value: male, color: '#3b82f6' }, { name: 'Female', value: female, color: '#ec4899' }];
  };

  const getTopBooks = () => {
    if (!allSheets || !allSheets.sheets) return [];
    return Object.keys(allSheets.sheets).map(sheetName => ({ name: sheetName, records: allSheets.sheets[sheetName].totalRecords || 0 })).sort((a, b) => b.records - a.records).slice(0, 10);
  };

  const renderFormField = (header, value, onChange, isEdit = false) => {
    if (isSexField(header)) {
      return (
        <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase" value={value || ''} onChange={(e) => onChange(header, e.target.value)}>
          <option value="">Select Gender</option>
          <option value="MALE">MALE</option>
          <option value="FEMALE">FEMALE</option>
        </select>
      );
    }
    if (isDateField(header)) {
      return <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" value={value || ''} onChange={(e) => onChange(header, e.target.value)} />;
    }
    const isLcrField = header.toLowerCase().includes('lcr') || header.toLowerCase().includes('registry number');
    return (
      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder={`Enter ${header}`} value={value || ''} onChange={(e) => { let newValue = e.target.value; if (!isLcrField) newValue = newValue.toUpperCase(); onChange(header, newValue); }} />
    );
  };

  const getFieldValue = (record, keywords) => {
    if (!record || !record.fullRecord || !record.headers) return '';
    const index = record.headers.findIndex(h => keywords.some(keyword => h?.toLowerCase().includes(keyword)));
    if (index !== -1 && record.fullRecord[index]) return record.fullRecord[index];
    return '';
  };

  if (loading && !allSheets) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(rgba(26, 42, 79, 0.92), rgba(255, 255, 255, 0.85))' }}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin-slow mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading spreadsheet data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(rgba(26, 42, 79, 0.92), rgba(255, 255, 255, 0.85))' }}>
        <div className="bg-white rounded-xl p-8 max-w-md text-center shadow-2xl">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={fetchAllSheets} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Retry</button>
        </div>
      </div>
    );
  }

  const sheetNames = getSheetNames();
  const stats = getDashboardStats();
  const displayRows = activeSheet ? getDisplayRows(activeSheet.data) : [];
  const availableMonths = activeSheet ? getAvailableMonths(activeSheet.data) : [];
  const totalFilteredRecords = displayRows.length;
  const totalRecords = activeSheet?.data?.length - 1 || 0;
  const monthlyData = getMonthlyDistribution();
  const yearlyData = getYearlyDistribution();
  const genderData = getGenderDistribution();
  const topBooks = getTopBooks();
  const avgRecordsPerBook = (stats.totalRecords / stats.totalSheets).toFixed(1);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { background: '#363636', color: '#fff', borderRadius: '8px' }, success: { duration: 3000 }, error: { duration: 4000 } }} />
      
      <aside className="w-80 fixed h-full overflow-hidden shadow-xl flex flex-col" style={{ background: 'rgba(26, 42, 79, 0.92)' }}>
        <div className="p-6 border-b border-white/30">
          <h2 className="text-2xl font-bold mb-1 text-white">LCR Registry</h2>
          <p className="text-sm text-white">Birth Records System</p>
        </div>
        <div className="p-4 pb-2">
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all mb-2 ${activeView === "dashboard" ? "bg-white/40 border-l-4 border-blue-600" : "hover:bg-white/30"}`} onClick={goToDashboard}>
            <span className="text-xl">📈</span>
            <span className="text-white">Dashboard</span>
          </button>
          <div className="h-px bg-gray-400/30 my-3"></div>
          <h3 className="text-xs uppercase tracking-wider text-white mb-2 px-3">Registry Books</h3>
        </div>
        <div className="px-4 pb-4 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-1">
            <button className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all font-semibold ${activeView === "sheet" && isAllBooks ? "bg-white/40 border-l-4 border-yellow-600" : "hover:bg-white/30"}`} onClick={fetchAllBooks}>
              <span className="text-xl">📚</span>
              <span className="flex-1 text-left text-white">All Registry Books</span>
              <span className="bg-gray-500/30 px-2 py-0.5 rounded-full text-xs text-white">{stats.totalRecords}</span>
            </button>
            {sheetNames.map((sheetName) => {
              const recordCount = allSheets.sheets[sheetName]?.totalRecords || 0;
              return (
                <button key={sheetName} className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${activeView === "sheet" && activeSheet?.name === sheetName && !isAllBooks ? "bg-white/40 border-l-4 border-blue-600" : "hover:bg-white/30"}`} onClick={() => fetchSpecificSheet(sheetName)}>
                  <span className="text-lg">📄</span>
                  <span className="flex-1 text-left text-sm truncate text-white">{sheetName}</span>
                  <span className="bg-gray-500/30 px-2 py-0.5 rounded-full text-xs text-white">{recordCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="flex-1 ml-80 overflow-auto h-screen custom-scrollbar">
        {activeView === "dashboard" ? (
          <div className="p-6">
            <div className="mb-8">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold text-gray-800 mb-2">Data Analytics Dashboard</h1>
                  <p className="text-gray-600">Comprehensive insights and analytics for LCR Registry Birth Records</p>
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-md" onClick={refreshData}>
                  <span>🔄</span> Refresh Data
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl text-blue-600">📚</div>
                  <div className="text-2xl font-bold text-blue-600">{stats.totalSheets}</div>
                </div>
                <h3 className="text-gray-600 text-sm font-medium">Total Registry Books</h3>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl text-green-600">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                  <div className="text-2xl font-bold text-green-600">{stats.totalRecords.toLocaleString()}</div>
                </div>
                <h3 className="text-gray-600 text-sm font-medium">Total Birth Records</h3>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl text-purple-600">📊</div>
                  <div className="text-2xl font-bold text-purple-600">{avgRecordsPerBook}</div>
                </div>
                <h3 className="text-gray-600 text-sm font-medium">Avg. Records per Book</h3>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl text-orange-600">📅</div>
                  <div className="text-2xl font-bold text-orange-600">{yearlyData.length}</div>
                </div>
                <h3 className="text-gray-600 text-sm font-medium">Years of Data</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-800 mb-4">📈 Monthly Registration Trends</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="registrations" fill="#3b82f6" radius={[4,4,0,0]} name="Registrations" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-800 mb-4">📊 Yearly Registration Trends</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={yearlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 4 }} name="Records" />
                    <Area type="monotone" dataKey="count" fill="#8b5cf6" fillOpacity={0.1} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
                <div className="text-3xl mb-3">💡</div>
                <h4 className="font-bold text-lg mb-2">Total Registrations</h4>
                <p className="text-3xl font-bold mb-2">{stats.totalRecords.toLocaleString()}</p>
                <p className="text-blue-100 text-sm">Across {stats.totalSheets} registry books</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                <div className="text-3xl mb-3">📈</div>
                <h4 className="font-bold text-lg mb-2">Peak Registration Month</h4>
                <p className="text-3xl font-bold mb-2">{monthlyData.reduce((max, item) => item.registrations > max.registrations ? item : max, monthlyData[0])?.month || 'N/A'}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
                <div className="text-3xl mb-3">⭐</div>
                <h4 className="font-bold text-lg mb-2">Largest Registry Book</h4>
                <p className="text-xl font-bold mb-1 truncate">{topBooks[0]?.name || 'N/A'}</p>
                <p className="text-green-100 text-sm">{topBooks[0]?.records?.toLocaleString() || 0} total records</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8">
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    {isAllBooks ? "All Registry Books" : activeSheet?.name}
                    {isAllBooks && <span className="inline-block ml-3 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">{sheetNames.length} Books</span>}
                  </h1>
                  <p className="text-gray-600 mt-1">Total Records: {totalRecords.toLocaleString()}</p>
                </div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-md" onClick={refreshData}>
                    <span>🔄</span> Refresh
                  </button>
                  <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2 shadow-md" onClick={openAddModal}>
                    <span className="text-lg">➕</span> Add New Record
                  </button>
                </div>
              </div>
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input type="text" className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                {searchTerm && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setSearchTerm("")}>✕</button>}
              </div>
              {availableMonths.length > 0 && (
                <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <label className="font-semibold text-gray-700">Filter by Month:</label>
                  <select className="px-3 py-1.5 border border-gray-300 rounded-lg" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                    <option value="all">All Months</option>
                    {availableMonths.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
                  </select>
                  {(selectedMonth !== "all" || searchTerm) && (
                    <div className="flex items-center gap-3 bg-blue-50 px-4 py-2 rounded-lg">
                      <span className="text-sm text-blue-700">
                        {searchTerm && `Search: "${searchTerm}"`}
                        {searchTerm && selectedMonth !== "all" && " • "}
                        {selectedMonth !== "all" && `Month: ${availableMonths.find(m => m.value === parseInt(selectedMonth))?.label}`}
                      </span>
                      <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs">{totalFilteredRecords} result(s)</span>
                      <button className="text-sm text-red-600 hover:text-red-700 font-medium" onClick={() => { setSelectedMonth("all"); setSearchTerm(""); }}>Clear All</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin-slow"></div>
                <p className="mt-4 text-gray-600">Loading sheet data...</p>
              </div>
            ) : displayRows.length > 0 ? (
              <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="overflow-x-auto max-h-[70vh]">
                  <table className="w-full">
                    <thead className="sticky top-0" style={{ background: 'rgba(26, 42, 79, 0.92)' }}>
                      <tr>
                        {isAllBooks && <th className="px-4 py-3 text-left text-sm font-semibold text-white">Book Name</th>}
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white">Book #</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white">Page #</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white">LCR Registry Number</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date of Registration</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white">Name of Child</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {displayRows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-gray-50 transition">
                          {isAllBooks && <td className="px-4 py-3 text-sm text-blue-600 font-medium">{row.bookName || "—"}</td>}
                          <td className="px-4 py-3 text-sm text-gray-800">{row.book || "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-800">{row.page || "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-800">{row.lcrNumber || "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-800">{row.registrationDate || "—"}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-800">{row.childName || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition" onClick={() => openModal(row)}>View Details</button>
                              <button className="px-3 py-1 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 transition" onClick={() => { const sheetName = isAllBooks ? row.bookName : activeSheet?.name; openEditModal(row, row.rowNumber); }}>Edit</button>
                              <button className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition" onClick={() => openPrintModal(row)}>Print</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <div className="text-6xl mb-4">🔍</div>
                <p className="text-gray-600 mb-4">No records found matching your search criteria.</p>
                {(selectedMonth !== "all" || searchTerm) && (
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition" onClick={() => { setSelectedMonth("all"); setSearchTerm(""); }}>Clear Filters</button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Print Certificate Modal - EXACT match to second image */}
      {isPrintModalOpen && selectedRecord && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white px-6 py-4 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">LCR Birth Certificate</h2>
                  <p className="text-blue-100 text-sm mt-1">Fill in the certificate details</p>
                </div>
                <button
                  className="text-2xl hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition"
                  onClick={closePrintModal}
                >
                  ×
                </button>
              </div>
            </div>
           
            <div className="flex-1 overflow-y-auto p-6">
              {/* Editable Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pb-4 border-b border-gray-200">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Date of Issue</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.date}
                    onChange={(e) => handlePrintInputChange('date', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Page Number</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.pageNumber}
                    onChange={(e) => handlePrintInputChange('pageNumber', e.target.value)}
                    placeholder="e.g., 72"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Book Number</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.bookNumber}
                    onChange={(e) => handlePrintInputChange('bookNumber', e.target.value)}
                    placeholder="e.g., 11"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Certification Issued To</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.issuedTo}
                    onChange={(e) => handlePrintInputChange('issuedTo', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Asst. Registration Officer</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.asstRegistrationOfficer}
                    onChange={(e) => handlePrintInputChange('asstRegistrationOfficer', e.target.value)}
                    placeholder="e.g., VANISSA RATILLA GASTA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Clerk III</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.municipalCivilRegistrar}
                    onChange={(e) => handlePrintInputChange('municipalCivilRegistrar', e.target.value)}
                    placeholder="e.g., EMMA CULTURA SALON"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">O.R. Number</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.orNumber}
                    onChange={(e) => handlePrintInputChange('orNumber', e.target.value)}
                    placeholder="e.g., 4987186"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Amount Paid</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.amountPaid}
                    onChange={(e) => handlePrintInputChange('amountPaid', e.target.value)}
                    placeholder="e.g., 105.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Date Paid</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={printData.datePaid}
                    onChange={(e) => handlePrintInputChange('datePaid', e.target.value)}
                  />
                </div>
              </div>

              {/* Certificate Preview - EXACT match to second image */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-lg font-semibold text-gray-800">Preview</h3>
                <div ref={printRef} className="relative bg-white border-2 border-gray-400 shadow-xl overflow-hidden" style={{ fontFamily: "'Times New Roman', serif", width: '100%' }}>
                  {/* Background Image */}
                  <div className="absolute inset-0 opacity-10 pointer-events-none">
                    <img src="/bg_image.png" alt="Background" className="w-full h-full object-cover" />
                  </div>
                 
                  {/* Content - compact to fit one page */}
                  <div className="relative pt-35 py-6 px-8 z-10">
                    {/* LCR Form No. 1A - LEFT ALIGNED */}
                    <div className="mb-1">
                      <p className="text-sm font-bold">LCR Form No. 1A</p>
                      <p className="text-sm italic">(Birth – Available)</p>
                    </div>

                    {/* OFFICE HEADER - CENTERED BOLD */}
                    <div className="text-center mb-3">
                      <h1 className="text-xl font-bold uppercase">OFFICE OF THE MUNICIPAL CIVIL REGISTRAR</h1>
                    </div>

                    <div className="border-b-2 border-dotted border-black w-full"></div>

                    {/* BIRTH AVAILABLE - CENTERED BOLD */}
                    <div className="text-center mb-4">
                      <h2 className="text-lg font-bold uppercase">BIRTH AVAILABLE</h2>
                    </div>

                    {/* Date on the right with "Date" below */}
                    <div className="flex justify-end mb-5">
                      <div className="text-right">
                        <p className="text-base">
                          {printData.date ? new Date(printData.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase() : '___________'}
                        </p>
                        <p className="text-xs">Date</p>
                      </div>
                    </div>

                    {/* WE CERTIFY statement */}
                    <div className="mb-4">
                      <p className="text-sm">
                        WE CERTIFY that, among others the following facts of Birth appear in our Register of Births on Page <strong>{printData.pageNumber || '___'}</strong> of book number <strong>{printData.bookNumber || '___'}</strong>:
                      </p>
                    </div>

                    {/* Data fields - table format with colons */}
                    <div className="space-y-0.5 text-sm mb-6">
                      <div className="flex">
                        <span className="w-56">PRN</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['prn']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">LCR Registry Number</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['lcr', 'registry']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Date of Registration</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['date of registration']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Name of Child</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['name of child']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Sex</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['sex', 'gender']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Date of Birth</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['date of birth']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Place of Birth</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['place of birth']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Name of Mother</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['name of mother']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Nationality</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">FILIPINO</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Name of Father</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['name of father']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Nationality</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">FILIPINO</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Date of Marriage of Parents</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['date of marriage']) || '___________'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56">Place of Marriage of Parents</span>
                        <span className="w-4">:</span>
                        <span className="flex-1 ml-2">{getFieldValue(selectedRecord, ['place of marriage']) || '___________'}</span>
                      </div>
                    </div>

                    {/* THIS CERTIFICATION statement */}
                    <div className="mb-5">
                      <p className="text-sm">
                        THIS CERTIFICATION is issued to <strong>{printData.issuedTo || '___________'}</strong> upon his/her request.
                      </p>
                    </div>

                    {/* Signature Section - ASST on RIGHT, Verified by on LEFT - same row */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-left">
                        <p className="text-xs font-bold mb-1">Verified by:</p>
                        <p className="font-bold text-sm">{printData.municipalCivilRegistrar || '____________________'}</p>
                        <p className="text-xs font-bold">CLERK III</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{printData.asstRegistrationOfficer || '____________________'}</p>
                        <p className="text-xs font-bold">ASST. REGISTRATION OFFICER</p>
                      </div>
                    </div>

                    {/* O.R. Information */}
                    <div className="space-y-0.5 text-sm mb-4">
                      <p><span className="font-bold">O.R Number:</span> {printData.orNumber || '___________'}</p>
                      <p><span className="font-bold">Amount Paid:</span> {printData.amountPaid ? printData.amountPaid : '___________'}</p>
                      <p><span className="font-bold">Date Paid:</span> {printData.datePaid ? new Date(printData.datePaid).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase() : '___________'}</p>
                    </div>

                    {/* NOTE */}
                    <div className="mt-3 text-xs italic">
                      <p>NOTE: This Certification is not valid if the mark of issuance or allotment of any entry</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
           
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 flex-shrink-0">
              <button
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                onClick={closePrintModal}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                onClick={generatePDF}
              >
                <span>📄</span> Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* View Details Modal */}
      {isModalOpen && selectedRecord && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white px-6 py-4">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Personal Information</h2>
                <button className="text-2xl hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center" onClick={closeModal}>×</button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="flex items-center gap-4 mb-6 pb-4 border-b">
                <div className="text-6xl"><svg className="w-16 h-16 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                <div><h3 className="text-2xl font-bold text-gray-800">{selectedRecord.fullRecord.find((_, idx) => selectedRecord.headers?.[idx]?.toLowerCase().includes('name of child')) || "Unknown"}</h3></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedRecord.fullRecord.map((value, index) => {
                  const header = selectedRecord.headers?.[index];
                  if (value && value.toString().trim() && !(isAllBooks && header === "Book Name")) {
                    return <div key={index} className="bg-gray-50 rounded-lg p-3"><div className="text-xs font-semibold text-blue-600 uppercase">{header}</div><div className="text-gray-800 font-medium mt-1">{value}</div></div>;
                  }
                  return null;
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button className="px-4 py-2 bg-yellow-500 text-white rounded-lg" onClick={() => { closeModal(); const sheetName = isAllBooks ? selectedRecord.bookName : activeSheet?.name; const rowIndex = displayRows.findIndex(r => r.childName === selectedRecord.childName); const rowNumber = rowIndex !== -1 ? displayRows[rowIndex]?.rowNumber : null; if (rowNumber && sheetName) openEditModal(selectedRecord, rowNumber); }}>Edit Record</button>
              <button className="px-4 py-2 bg-gray-600 text-white rounded-lg" onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Record Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4">
              <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold">Add New Birth Record</h2><p className="text-green-100 text-sm">Fill in the details below</p></div>
                <button className="text-2xl hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center" onClick={closeAddModal}>×</button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              {isAllBooks && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Select Registry Book</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={selectedSheetForAdd} onChange={(e) => handleSheetSelectionChange(e.target.value)}>
                    <option value="">-- Select a registry book --</option>
                    {sheetNames.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
                  </select>
                </div>
              )}
              {((isAllBooks && selectedSheetForAdd) || (!isAllBooks && selectedSheetForAdd)) && (
                <div>
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg"><p className="text-sm text-blue-700"><strong>Adding to:</strong> {selectedSheetForAdd}</p></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(isAllBooks ? addFormHeaders : activeSheet?.data?.[0] || []).map((header, idx) => {
                      if (header && header.trim()) {
                        return <div key={idx}><label className="block text-sm font-semibold text-gray-700 mb-2">{header}</label>{renderFormField(header, formData[header] || '', (field, value) => setFormData({ ...formData, [field]: value }))}</div>;
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}
              {isAllBooks && !selectedSheetForAdd && <div className="text-center py-8 text-gray-500"><p>Please select a registry book above</p></div>}
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button className="px-4 py-2 bg-gray-600 text-white rounded-lg" onClick={closeAddModal}>Cancel</button>
              <button className={`px-4 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2 ${!selectedSheetForAdd ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={handleAddRecord} disabled={!selectedSheetForAdd}><span>💾</span> Save Record</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-4">
              <div className="flex justify-between items-center">
                <div><h2 className="text-2xl font-bold">Edit Birth Record</h2><p className="text-yellow-100 text-sm">Update the information below</p></div>
                <button className="text-2xl hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center" onClick={closeEditModal}>×</button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-4 p-3 bg-yellow-50 rounded-lg"><p className="text-sm text-yellow-700"><strong>Editing Row #{editingRowNumber}</strong> in <strong>{isAllBooks ? editingRecord.bookName : activeSheet?.name}</strong></p></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editingRecord.headers?.map((header, idx) => {
                  if (isAllBooks && header === 'Book Name') return null;
                  if (header && header.trim()) {
                    const value = editingRecord.fullRecord?.[header] || '';
                    return <div key={idx}><label className="block text-sm font-semibold text-gray-700 mb-2">{header}</label>{renderFormField(header, value, (field, val) => { const updated = { ...editingRecord.fullRecord }; updated[field] = val; setEditingRecord({ ...editingRecord, fullRecord: updated }); })}</div>;
                  }
                  return null;
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-between gap-3">
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg" onClick={() => { const sheetName = isAllBooks ? editingRecord.bookName : activeSheet?.name; if (confirm("Delete this record?")) handleDeleteRecord(sheetName, editingRowNumber); }}>Delete Record</button>
              <div className="flex gap-3"><button className="px-4 py-2 bg-gray-600 text-white rounded-lg" onClick={closeEditModal}>Cancel</button><button className="px-4 py-2 bg-yellow-500 text-white rounded-lg flex items-center gap-2" onClick={handleUpdateRecord}><span>💾</span> Update Record</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
