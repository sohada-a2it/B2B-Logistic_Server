// /app/lib/report.js

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// Test API connection
export const testApiConnection = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return { success: true, message: data.message || 'Connected successfully' };
    } else {
      return { 
        success: false, 
        message: `Server responded with status: ${response.status}` 
      };
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    return { 
      success: false, 
      message: error.message || 'Cannot connect to backend server' 
    };
  }
};

// Fetch employees
export const fetchEmployees = async () => {
  try {
    const token = localStorage.getItem("adminToken") || localStorage.getItem("employeeToken");
    const response = await fetch(`${API_BASE_URL}/api/reports/employees`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching employees:', error);
    throw error;
  }
};

// Fetch departments
export const fetchDepartments = async () => {
  try {
    const token = localStorage.getItem("adminToken") || localStorage.getItem("employeeToken");
    const response = await fetch(`${API_BASE_URL}/api/reports/departments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching departments:', error);
    throw error;
  }
};

// Export report - UPDATED VERSION
export const exportReport = async (reportType, format, filters) => {
  try {
    const token = localStorage.getItem("adminToken") || localStorage.getItem("employeeToken");
    
    if (!token) {
      throw new Error('Authentication token not found. Please login again.');
    }

    // Map report types to correct endpoints
    const endpointMap = {
      "attendance": "/api/reports/attendance",
      "payroll": "/api/reports/payroll",
      "employee-summary": "/api/reports/employee-summary"
    };

    const endpoint = endpointMap[reportType];
    
    if (!endpoint) {
      throw new Error(`Invalid report type: ${reportType}`);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...filters,
        format: format.toLowerCase() // Ensure format is lowercase
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP error! status: ${response.status}`;
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      throw new Error(errorMessage);
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    
    // Handle different response types
    if (contentType.includes('application/json')) {
      return await response.json();
    } else if (contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
      return await response.blob();
    } else if (contentType.includes('application/pdf')) {
      return await response.blob();
    } else if (contentType.includes('text/csv')) {
      return await response.blob();
    } else {
      // Default to blob
      return await response.blob();
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};