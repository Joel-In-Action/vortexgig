import axios from 'axios'

/**
 * One axios instance for the whole app.
 *
 * The token is attached on every request and, when the server tells us it is no
 * longer good, cleared here — that way a session that expires while a tab is
 * open lands on the sign-in page instead of failing silently on each fetch.
 */
const TOKEN_KEY = 'vortexgig.token'

const api = axios.create({ baseURL: '/api' })

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    // 401 means the token is gone or stale. 403 is a live session hitting
    // something it is not allowed to do, which must NOT sign the user out.
    if (status === 401 && getToken()) {
      setToken(null)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=1')
      }
    }
    return Promise.reject(error)
  }
)

/** Pulls the server's human-readable message out of whatever shape came back. */
export function errorMessage(error, fallback = 'Something went wrong. Try again in a moment.') {
  return error?.response?.data?.error || error?.message || fallback
}

export default api
