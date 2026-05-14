import axios from 'axios'

export const TESTTORIA_API_KEY_STORAGE_KEY = 'testtoria_api_key'
export const AUTH_TOKEN_STORAGE_KEY = 'auth_token'
export const AUTH_USER_STORAGE_KEY = 'user'
export const SELECTOR_FINDER_SELECTION_STORAGE_KEY = 'testtoria_selector_finder_selection'
export const SELECTOR_FINDER_PAYLOAD_STORAGE_KEY = 'selector_finder_payload'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token =
    typeof window === 'undefined' ? '' : localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim()

  if (token && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      localStorage.removeItem(AUTH_USER_STORAGE_KEY)
    }

    return Promise.reject(error)
  },
)

const parseJsonField = (value, fallback) => {
  if (!value) {
    return fallback
  }

  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const normalizeTestCase = (testCase) => ({
  ...testCase,
  steps: parseJsonField(testCase.steps, []),
})

const normalizeRun = (run) => ({
  ...run,
  logs: parseJsonField(run.logs, []),
})

export const getStoredTesttoriaApiKey = () => {
  if (typeof window === 'undefined') {
    return ''
  }

  return localStorage.getItem(TESTTORIA_API_KEY_STORAGE_KEY)?.trim() || ''
}

export const saveStoredTesttoriaApiKey = (apiKey) => {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(TESTTORIA_API_KEY_STORAGE_KEY, String(apiKey || '').trim())
}

export const clearStoredTesttoriaApiKey = () => {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(TESTTORIA_API_KEY_STORAGE_KEY)
}

const buildAiHeaders = () => {
  const apiKey = getStoredTesttoriaApiKey()
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

export const getAuthToken = () => {
  if (typeof window === 'undefined') {
    return ''
  }

  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() || ''
}

export const getStoredUser = () => {
  if (typeof window === 'undefined') {
    return null
  }

  const rawUser = localStorage.getItem(AUTH_USER_STORAGE_KEY)

  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser)
  } catch {
    return null
  }
}

export const isAuthenticated = () => Boolean(getAuthToken())

export const saveAuthSession = (token, user) => {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, String(token || ''))

  if (user) {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
  }
}

export const clearAuthSession = () => {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  localStorage.removeItem(AUTH_USER_STORAGE_KEY)
}

export const logoutUser = () => {
  clearAuthSession()
}

export const loginUser = async (payload) => {
  const response = await api.post('/api/auth/login', payload)
  return response.data
}

export const registerUser = async (payload) => {
  const response = await api.post('/api/auth/register', payload)
  return response.data
}

export const requestPasswordReset = async (email) => {
  const response = await api.post('/api/auth/forgot-password', { email })
  return response.data
}

export const resetPassword = async ({ token, password }) => {
  const response = await api.post('/api/auth/reset-password', { token, password })
  return response.data
}

export const createApiKey = async (name) => {
  const response = await api.post('/api/api-keys/create', { name })
  return response.data
}

export const listApiKeys = async () => {
  const response = await api.get('/api/api-keys')
  return response.data
}

export const revokeApiKey = async (id) => {
  const response = await api.delete(`/api/api-keys/${id}`)
  return response.data
}

export const getTests = async () => {
  const response = await api.get('/api/tests')
  return {
    ...response.data,
    data: (response.data.data || []).map(normalizeTestCase),
  }
}

export const createTest = async (payload) => {
  const response = await api.post('/api/tests', payload)
  return normalizeTestCase(response.data)
}

export const bulkCreateTests = async (testCases) => {
  const response = await api.post('/api/tests/bulk-create', { testCases })
  return {
    ...response.data,
    data: (response.data.data || []).map(normalizeTestCase),
  }
}

export const getTestById = async (id) => {
  const response = await api.get(`/api/tests/${id}`)
  return normalizeTestCase(response.data)
}

export const updateTest = async (id, payload) => {
  const response = await api.put(`/api/tests/${id}`, payload)
  return {
    ...response.data,
    testCase: response.data.testCase ? normalizeTestCase(response.data.testCase) : null,
  }
}

export const updateTestScript = async (id, generatedScript) => {
  const response = await api.patch(`/api/tests/${id}/script`, {
    generated_script: generatedScript,
  })
  return {
    ...response.data,
    testCase: response.data.testCase ? normalizeTestCase(response.data.testCase) : null,
  }
}

export const deleteTest = async (id) => {
  const response = await api.delete(`/api/tests/${id}`)
  return response.data
}

export const bulkDeleteTests = async (ids) => {
  const response = await api.delete('/api/tests/bulk-delete', {
    data: { ids },
  })
  return response.data
}

export const generateScript = async (data) => {
  const response = await api.post('/api/ai/generate-script', data, {
    headers: buildAiHeaders(),
  })
  return response.data
}

export const inspectSelectors = async ({ url, elements }) => {
  const response = await api.post(
    '/api/ai/inspect-selectors',
    { url, ...(elements?.length ? { elements } : {}) },
    { headers: buildAiHeaders() },
  )
  return response.data
}

export const scanSelectors = async ({ url }) => {
  try {
    const response = await api.post(
      '/api/selectors/scan',
      { url },
      { headers: buildAiHeaders() },
    )
    return response.data
  } catch (error) {
    const isMissingNewRoute =
      error.response?.status === 404 &&
      /route not found/i.test(String(error.response?.data?.error || error.response?.data?.message || ''))

    if (!isMissingNewRoute) {
      throw error
    }

    return inspectSelectors({ url })
  }
}

export const generateManualSelector = async ({ text, label, placeholder, elementType }) => {
  try {
    const response = await api.post(
      '/api/selectors/generate-manual',
      { text, label, placeholder, elementType },
      { headers: buildAiHeaders() },
    )
    return response.data
  } catch (error) {
    const isMissingNewRoute =
      error.response?.status === 404 &&
      /route not found/i.test(String(error.response?.data?.error || error.response?.data?.message || ''))

    if (!isMissingNewRoute) {
      throw error
    }

    const candidates = []
    const normalizedText = String(text || '').trim()
    const normalizedLabel = String(label || '').trim()
    const normalizedPlaceholder = String(placeholder || '').trim()
    const normalizedType = String(elementType || 'other').trim().toLowerCase()
    const tagByType = {
      button: 'button',
      link: 'a',
      input: 'input',
      dropdown: 'select',
      image: 'img',
    }
    const tag = tagByType[normalizedType] || ''
    const addCandidate = (selector, selectorType) => {
      if (selector && !candidates.some((candidate) => candidate.selector === selector)) {
        candidates.push({ selector, selectorType })
      }
    }

    if (normalizedText) {
      if (tag) addCandidate(`${tag}:has-text("${normalizedText.replace(/"/g, '\\"')}")`, 'text')
      addCandidate(`text="${normalizedText.replace(/"/g, '\\"')}"`, 'text')
      addCandidate(`xpath=//*[contains(normalize-space(), "${normalizedText.replace(/"/g, '\\"')}")]`, 'xpath')
    }

    if (normalizedPlaceholder) {
      addCandidate(`input[placeholder*="${normalizedPlaceholder.replace(/"/g, '\\"')}" i]`, 'placeholder')
      addCandidate(`textarea[placeholder*="${normalizedPlaceholder.replace(/"/g, '\\"')}" i]`, 'placeholder')
    }

    if (normalizedLabel) {
      const labelToken = normalizedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      addCandidate(`label:has-text("${normalizedLabel.replace(/"/g, '\\"')}")`, 'label')
      addCandidate(`input[aria-label*="${normalizedLabel.replace(/"/g, '\\"')}" i]`, 'label')
      addCandidate(`input[name*="${labelToken}" i]`, 'name')
    }

    if (!candidates.length) {
      throw error
    }

    return {
      selector: candidates[0].selector,
      selectorType: candidates[0].selectorType,
      allSelectors: candidates,
    }
  }
}

export const generateScriptFromRecording = async ({ title, startUrl, actions }) => {
  const response = await api.post(
    '/api/ai/generate-script-from-recording',
    { title, startUrl, actions },
    { headers: buildAiHeaders() },
  )
  return response.data
}

export const mapTestCasesToScripts = async ({
  testCaseIds,
  autoRun = false,
  overwriteExisting = false,
}) => {
  const response = await api.post(
    '/api/ai/map-testcases-to-scripts',
    {
      testCaseIds,
      autoRun,
      overwriteExisting,
    },
    {
      headers: buildAiHeaders(),
    },
  )
  return response.data
}

export const generateManualTestCases = async (feature) => {
  const response = await api.post(
    '/api/ai/generate-testcases',
    { feature },
    { headers: buildAiHeaders() },
  )
  return response.data
}

export const generateTestCasesFromDocument = async ({
  content,
  type,
  count,
  coverageLevel,
}) => {
  const response = await api.post(
    '/api/ai/generate-testcases-from-doc',
    { content, type, count, coverageLevel },
    { headers: buildAiHeaders() },
  )
  return response.data
}

export const refineTestCases = async ({
  content,
  testCases,
  mode,
  targetCount,
  instruction,
}) => {
  const response = await api.post(
    '/api/ai/refine-testcases',
    { content, testCases, mode, targetCount, instruction },
    { headers: buildAiHeaders() },
  )
  return response.data
}

export const generateAndRunFromDocument = async ({ content, type }) => {
  const response = await api.post(
    '/api/ai/generate-and-run',
    { content, type },
    { headers: buildAiHeaders() },
  )
  return response.data
}

export const runTest = async (id) => {
  const response = await api.post(`/api/tests/${id}/run`)
  return {
    ...response.data,
    testRun: response.data.testRun ? normalizeRun(response.data.testRun) : null,
  }
}

export const getRuns = async (params = {}) => {
  const response = await api.get('/api/runs', { params })
  return {
    ...response.data,
    data: (response.data.data || []).map(normalizeRun),
  }
}

export const getRunById = async (id) => {
  const response = await api.get(`/api/runs/${id}`)
  return normalizeRun(response.data)
}

export const getBugs = async () => {
  const response = await api.get('/api/bugs')
  return response.data
}

export const getDashboardSummary = async () => {
  try {
    const response = await api.get('/api/dashboard/summary')
    return response.data
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error
    }

    const [testsResponse, runsResponse] = await Promise.all([getTests(), getRuns()])
    const totalTestCases = testsResponse.total ?? testsResponse.data.length
    const totalRuns = runsResponse.total ?? runsResponse.data.length
    const passedRuns = runsResponse.data.filter((run) =>
      ['pass', 'passed'].includes(String(run.status || '').toLowerCase()),
    ).length
    const failedRuns = runsResponse.data.filter((run) =>
      ['fail', 'failed', 'error'].includes(String(run.status || '').toLowerCase()),
    ).length

    return {
      totalTestCases,
      totalRuns,
      passedRuns,
      failedRuns,
    }
  }
}

export default api
