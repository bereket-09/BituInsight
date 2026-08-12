import client from './client';

export const authApi = {
  login: (email, password) => client.post('/auth/login', { email, password }),
  me: () => client.get('/auth/me'),
};

export const workflowApi = {
  list: () => client.get('/workflows'),
  get: (slug) => client.get(`/workflows/${slug}`),
};

function appendParseOptions(formData, options = {}) {
  if (options.sheetName) formData.append('sheetName', options.sheetName);
  if (options.sheetIndex != null) formData.append('sheetIndex', String(options.sheetIndex));
  if (options.headerRowIndex != null)
    formData.append('headerRowIndex', String(options.headerRowIndex));
  if (options.dataStartRowIndex != null)
    formData.append('dataStartRowIndex', String(options.dataStartRowIndex));
  if (options.autoDetect === false) formData.append('autoDetect', 'false');
}

export const reportApi = {
  list: (params) => client.get('/reports', { params }),
  get: (id) => client.get(`/reports/${id}`),
  preview: (formData) =>
    client.post('/reports/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  upload: (formData, onProgress) =>
    client.post('/reports/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  validate: (file, workflowSlug, parseOptions, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workflowSlug', workflowSlug);
    appendParseOptions(formData, parseOptions);
    return client.post('/reports/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    });
  },
  buildUploadFormData: (file, workflowSlug, parseOptions) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workflowSlug', workflowSlug);
    appendParseOptions(formData, parseOptions);
    return formData;
  },
  sendToTeams: (id, webhookUrl) =>
    client.post(`/reports/${id}/teams`, { webhookUrl }),
  aggregate: (workflowSlug, params) =>
    client.get(`/reports/aggregate/${workflowSlug}`, { params }),
  download: (id) =>
    client.get(`/reports/${id}/download`, { responseType: 'blob' }),
  downloadChart: (reportId, chartId) =>
    client.get(`/reports/${reportId}/charts/${chartId}/download`, {
      responseType: 'blob',
    }),
};

export const dashboardApi = {
  get: () => client.get('/dashboard'),
};

export const workbookApi = {
  preview: (formData) =>
    client.post('/workbooks/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  upload: (formData, onProgress) =>
    client.post('/workbooks/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  get: (id) => client.get(`/workbooks/${id}`),
  list: (params) => client.get('/workbooks', { params }),
  updateKpiThreshold: (workbookId, reportId, threshold) =>
    client.patch(`/workbooks/${workbookId}/kpis/${reportId}/threshold`, { threshold }),
  downloadPresentation: (workbookId, payload = {}) =>
    client.post(`/workbooks/${workbookId}/export/pptx`, payload, { responseType: 'blob' }),
};
