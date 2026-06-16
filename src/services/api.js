// src/services/api.js
// Use Vercel Serverless API for all operations

class LCRAPI {
  constructor() {
    this.baseUrl = '/api/sheets';
  }

  async request(endpoint, method = 'GET', data = null) {
    let url = `${this.baseUrl}${endpoint}`;
    
    if (method === 'GET' && data) {
      const params = new URLSearchParams(data);
      url = `${this.baseUrl}?${params.toString()}`;
    }
    
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        const message = `HTTP ${response.status}: ${text.substring(0, 200)}`;
        throw new Error(message);
      }
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('API Error:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllSheets() {
    return this.request('/?all=true', 'GET');
  }

  async getSheetData(sheetName) {
    return this.request(`/?sheetName=${encodeURIComponent(sheetName)}`, 'GET');
  }

  async addRecord(sheetName, record) {
    return this.request('/', 'POST', {
      action: 'addRecord',
      sheetName: sheetName,
      record: record
    });
  }

  async updateRecord(sheetName, rowNumber, record) {
    return this.request('/', 'POST', {
      action: 'updateRecord',
      sheetName: sheetName,
      rowNumber: rowNumber,
      record: record
    });
  }

  async deleteRecord(sheetName, rowNumber) {
    return this.request('/', 'POST', {
      action: 'deleteRecord',
      sheetName: sheetName,
      rowNumber: rowNumber
    });
  }
}

export default new LCRAPI();
