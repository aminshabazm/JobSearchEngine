export function getToken() {
  return localStorage.getItem("auth_token") || "";
}

export function setToken(token) {
  localStorage.setItem("auth_token", token);
}

export function clearToken() {
  localStorage.removeItem("auth_token");
}

export async function apiFetch(url, opts = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401 && url !== "/api/login") {
    clearToken();
    window.location.reload();
    throw new Error("Session expired — please log in again");
  }
  return res;
}
