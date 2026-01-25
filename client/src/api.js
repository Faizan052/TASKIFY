export const getToken = () => localStorage.getItem('tm_token') || '';

const API_BASE_URL = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE_URL) ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '') : '';

const buildUrl = (path) => {
  if (!path) return path;
  if (/^https?:\/\/|^\/\//i.test(path)) {
    return path;
  }
  if (path.startsWith('/')) {
    return `${API_BASE_URL}${path}`;
  }
  return `${API_BASE_URL}/${path}`;
};

export const resolveApiUrl = (path) => buildUrl(path);
export const resolveAssetUrl = (path) => buildUrl(path);

const parseResponse = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return { message: text };
  }
};

export const apiFetch = async (path, options = {}) => {
  const token = getToken();
  const { method = 'GET', body, headers = {}, skipJson } = options;
  const finalHeaders = { ...headers };

  let payload = body;
  if (body && !(body instanceof FormData) && !headers['Content-Type'] && !skipJson) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(buildUrl(path), { method, body: payload, headers: finalHeaders });
  } catch (err) {
    throw new Error(err && err.message ? `Network error: ${err.message}` : 'Network error while calling API');
  }
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error((data && data.message) || response.statusText || 'Request failed');
  }
  return data;
};

const parseXhrResponse = (xhr) => {
  const text = xhr.responseText || '';
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return { message: text };
  }
};

export const uploadWithProgress = (path, { method = 'POST', body, headers = {}, onProgress, timeout = 10 * 60 * 1000 } = {}) => {
  const token = getToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, buildUrl(path));
    xhr.timeout = timeout;

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    Object.entries(headers).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        xhr.setRequestHeader(key, value);
      }
    });

    if (typeof onProgress === 'function') {
      xhr.upload.onprogress = (event) => {
        onProgress(event);
      };
    }

    xhr.onload = () => {
      const data = parseXhrResponse(xhr);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error((data && data.message) || xhr.statusText || 'Upload failed'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading file'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out'));
    };

    try {
      xhr.send(body);
    } catch (err) {
      reject(err);
    }
  });
};

export const clearSession = () => {
  localStorage.removeItem('tm_token');
  localStorage.removeItem('tm_isAdmin');
  localStorage.removeItem('tm_role');
};
