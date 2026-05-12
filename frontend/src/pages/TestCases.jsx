import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AutomationStepEditor from '../components/AutomationStepEditor'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import TestCaseCard from '../components/TestCaseCard'
import {
  bulkCreateTests,
  bulkDeleteTests,
  createTest,
  deleteTest,
  generateTestCasesFromDocument,
  getTests,
  mapTestCasesToScripts,
  refineTestCases,
} from '../services/api'
import {
  createEmptyAutomationStep,
  serializeAutomationStep,
  validateAutomationSteps,
} from '../utils/automationSteps'

const initialForm = {
  title: '',
  description: '',
  preconditions: '',
  url: '',
  priority: 'medium',
  steps: [createEmptyAutomationStep()],
  expectedResult: '',
}

const generatorTypeOptions = [
  { value: 'story', label: 'User Story' },
  { value: 'acceptance_criteria', label: 'Acceptance Criteria' },
  { value: 'description', label: 'Description' },
  { value: 'document', label: 'Full Document' },
]

const coverageOptions = [
  { value: 'basic', label: 'Basic' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
]

const priorityOptions = ['High', 'Medium', 'Low']
const typeOptions = ['Positive', 'Negative', 'Edge', 'Validation']

const initialGeneratorForm = {
  content: '',
  type: 'story',
  coverageLevel: 'standard',
  count: 10,
}

const emptyGeneratedCase = {
  title: '',
  preconditions: 'None',
  steps: [''],
  expectedResult: '',
  priority: 'Medium',
  type: 'Positive',
  module: 'General',
}

function buildGeneratedId() {
  return `generated-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizePriorityForSave(priority) {
  const normalizedPriority = String(priority || '').trim().toLowerCase()

  if (['low', 'medium', 'high', 'critical'].includes(normalizedPriority)) {
    return normalizedPriority
  }

  return 'medium'
}

function normalizeGeneratedCase(testCase = {}) {
  const type = typeOptions.includes(testCase.type) ? testCase.type : 'Positive'
  const priority = priorityOptions.includes(testCase.priority) ? testCase.priority : 'Medium'

  return {
    localId: testCase.localId || buildGeneratedId(),
    selected: testCase.selected !== false,
    editing: testCase.editing !== false,
    title: testCase.title || '',
    preconditions: testCase.preconditions || 'None',
    steps: Array.isArray(testCase.steps) && testCase.steps.length ? testCase.steps : [''],
    expectedResult: testCase.expectedResult || '',
    priority,
    type,
    module: testCase.module || 'General',
  }
}

function formatGeneratedCases(testCases = []) {
  return testCases.map((testCase) => normalizeGeneratedCase(testCase))
}

function dedupeGeneratedCases(testCases) {
  const seenTitles = new Set()

  return testCases.filter((testCase) => {
    const signature = `${String(testCase.title || '').trim().toLowerCase()}::${String(
      testCase.expectedResult || '',
    )
      .trim()
      .toLowerCase()}`

    if (!testCase.title.trim() || seenTitles.has(signature)) {
      return false
    }

    seenTitles.add(signature)
    return true
  })
}

function toSavableGeneratedCase(testCase, generatorForm) {
  return {
    title: testCase.title.trim(),
    steps: testCase.steps.map((step) => step.trim()).filter(Boolean),
    expectedResult: testCase.expectedResult.trim(),
    preconditions: testCase.preconditions.trim() || 'None',
    description: `Generated from ${generatorTypeOptions.find((option) => option.value === generatorForm.type)?.label || 'Document'} input. Type: ${testCase.type}. Module: ${testCase.module}.`,
    priority: normalizePriorityForSave(testCase.priority),
    type: testCase.type,
    module: testCase.module,
  }
}

function TestCases() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingTestId, setDeletingTestId] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationStage, setGenerationStage] = useState('')
  const [savingGenerated, setSavingGenerated] = useState(false)
  const [refiningAction, setRefiningAction] = useState('')
  const [mappingAction, setMappingAction] = useState('')
  const [mappingResults, setMappingResults] = useState([])
  const [selectedTestIds, setSelectedTestIds] = useState([])
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [mappingError, setMappingError] = useState('')
  const [generationStatus, setGenerationStatus] = useState('')
  const [featureSummary, setFeatureSummary] = useState('')
  const [detectedFlows, setDetectedFlows] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false)
  const [isManualGeneratedModalOpen, setIsManualGeneratedModalOpen] = useState(false)
  const [isAddMoreModalOpen, setIsAddMoreModalOpen] = useState(false)
  const [addMoreInstruction, setAddMoreInstruction] = useState('')
  const [manualGeneratedCase, setManualGeneratedCase] = useState(emptyGeneratedCase)
  const [form, setForm] = useState(initialForm)
  const [generatorForm, setGeneratorForm] = useState(initialGeneratorForm)
  const [generatedTestCases, setGeneratedTestCases] = useState([])

  const loadTests = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await getTests()
      setTests(response.data || [])
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTests()
  }, [])

  useEffect(() => {
    if (!location.state?.message) {
      return
    }

    setStatusMessage(location.state.message)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const selectedGeneratedCount = generatedTestCases.filter((testCase) => testCase.selected).length
  const allGeneratedSelected =
    generatedTestCases.length > 0 && selectedGeneratedCount === generatedTestCases.length

  const mappingResultsById = mappingResults.reduce((accumulator, result) => {
    accumulator[result.testCaseId] = result
    return accumulator
  }, {})

  const allSelected = tests.length > 0 && selectedTestIds.length === tests.length

  const selectedGeneratedCases = useMemo(
    () =>
      generatedTestCases
        .filter((testCase) => testCase.selected)
        .map((testCase) => toSavableGeneratedCase(testCase, generatorForm))
        .filter(
          (testCase) => testCase.title && testCase.steps.length && testCase.expectedResult,
        ),
    [generatedTestCases, generatorForm],
  )

  const handleCreateTest = async (event) => {
    event.preventDefault()

    try {
      setSubmitting(true)
      const validationErrors = validateAutomationSteps(form.steps)

      if (validationErrors.length) {
        setError(validationErrors[0])
        setSubmitting(false)
        return
      }

      const steps = form.steps
        .map(serializeAutomationStep)
        .filter((step) =>
          typeof step === 'string'
            ? Boolean(step.trim())
            : Boolean(String(step.description || step.action || step.selector || step.assertion || '').trim()),
        )

      await createTest({
        title: form.title,
        description: form.description,
        preconditions: form.preconditions,
        url: form.url,
        priority: form.priority,
        steps,
        expectedResult: form.expectedResult,
      })

      setForm(initialForm)
      setIsModalOpen(false)
      setStatusMessage('Test case created successfully.')
      await loadTests()
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateCases = async (event) => {
    event?.preventDefault()

    if (!generatorForm.content.trim()) {
      setGenerationError('Please paste a user story, acceptance criteria, or document first.')
      return
    }

    try {
      setGenerating(true)
      setGenerationStage('Analyzing feature scope and flows...')
      setGenerationError('')
      setGenerationStatus('')
      setGeneratedTestCases([])
      setFeatureSummary('')
      setDetectedFlows([])

      const response = await generateTestCasesFromDocument({
        content: generatorForm.content,
        type: generatorForm.type,
        count: Number(generatorForm.count),
        coverageLevel: generatorForm.coverageLevel,
      })

      setGenerationStage('Preparing editable test cases...')
      setFeatureSummary(response.summary || '')
      setDetectedFlows(response.detectedFlows || [])
      setGeneratedTestCases(formatGeneratedCases(response.testCases || []))
      setGenerationStatus('Generated detailed manual test cases. Review and select what to save.')
    } catch (requestError) {
      setGenerationError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setGenerating(false)
      setGenerationStage('')
    }
  }

  const runRefinement = async ({ mode, targetCount, instruction }) => {
    if (!generatedTestCases.length) {
      setGenerationError('Generate or add at least one test case before refining.')
      return
    }

    try {
      setRefiningAction(mode)
      setGenerationError('')
      setGenerationStatus('')

      const response = await refineTestCases({
        content: generatorForm.content,
        testCases: generatedTestCases.map(({ selected, localId, ...testCase }) => testCase),
        mode,
        targetCount,
        instruction,
      })

      const refinedCases = formatGeneratedCases(response.testCases || [])
      setGeneratedTestCases(dedupeGeneratedCases(refinedCases))
      setGenerationStatus(response.summary || 'Updated generated test cases.')
      setIsAddMoreModalOpen(false)
      setAddMoreInstruction('')
    } catch (requestError) {
      setGenerationError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message ||
          'Unable to refine test cases. Please try again.',
      )
    } finally {
      setRefiningAction('')
    }
  }

  const handleShrink = () => {
    const targetCount = Math.max(1, Number(generatorForm.count) || generatedTestCases.length)
    void runRefinement({ mode: 'shrink', targetCount })
  }

  const handleSaveSelectedGenerated = async () => {
    if (!selectedGeneratedCases.length) {
      setGenerationError('Select at least one complete test case before saving.')
      return
    }

    try {
      setSavingGenerated(true)
      setGenerationError('')
      await bulkCreateTests(selectedGeneratedCases)
      setGenerationStatus(`${selectedGeneratedCases.length} selected test case(s) saved.`)
      setGeneratedTestCases((current) => current.filter((testCase) => !testCase.selected))
      await loadTests()
    } catch (requestError) {
      setGenerationError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setSavingGenerated(false)
    }
  }

  const handleDiscardGenerated = () => {
    setGeneratedTestCases([])
    setGenerationError('')
    setGenerationStatus('')
    setGenerationStage('')
    setFeatureSummary('')
    setDetectedFlows([])
    setGeneratorForm(initialGeneratorForm)
    setIsGeneratorOpen(false)
    setIsManualGeneratedModalOpen(false)
    setIsAddMoreModalOpen(false)
  }

  const handleGeneratedCaseChange = (localId, field, value) => {
    setGeneratedTestCases((current) =>
      current.map((testCase) =>
        testCase.localId === localId ? { ...testCase, [field]: value } : testCase,
      ),
    )
  }

  const handleGeneratedEditing = (localId, editing) => {
    setGeneratedTestCases((current) =>
      current.map((testCase) =>
        testCase.localId === localId ? { ...testCase, editing } : testCase,
      ),
    )
  }

  const handleGeneratedStepChange = (localId, stepIndex, value) => {
    setGeneratedTestCases((current) =>
      current.map((testCase) =>
        testCase.localId === localId
          ? {
              ...testCase,
              steps: testCase.steps.map((step, currentIndex) =>
                currentIndex === stepIndex ? value : step,
              ),
            }
          : testCase,
      ),
    )
  }

  const addGeneratedStep = (localId) => {
    setGeneratedTestCases((current) =>
      current.map((testCase) =>
        testCase.localId === localId
          ? { ...testCase, steps: [...testCase.steps, ''] }
          : testCase,
      ),
    )
  }

  const removeGeneratedStep = (localId, stepIndex) => {
    setGeneratedTestCases((current) =>
      current.map((testCase) =>
        testCase.localId === localId
          ? {
              ...testCase,
              steps:
                testCase.steps.length > 1
                  ? testCase.steps.filter((_, currentIndex) => currentIndex !== stepIndex)
                  : [''],
            }
          : testCase,
      ),
    )
  }

  const handleGeneratedSelect = (localId, selected) => {
    setGeneratedTestCases((current) =>
      current.map((testCase) =>
        testCase.localId === localId ? { ...testCase, selected } : testCase,
      ),
    )
  }

  const handleSelectAllGenerated = (selected) => {
    setGeneratedTestCases((current) => current.map((testCase) => ({ ...testCase, selected })))
  }

  const handleDeleteGenerated = (localId) => {
    setGeneratedTestCases((current) => current.filter((testCase) => testCase.localId !== localId))
  }

  const openManualGeneratedModal = () => {
    setManualGeneratedCase({ ...emptyGeneratedCase, steps: [''] })
    setIsManualGeneratedModalOpen(true)
  }

  const handleManualGeneratedCaseChange = (field, value) => {
    setManualGeneratedCase((current) => ({ ...current, [field]: value }))
  }

  const handleManualGeneratedStepChange = (stepIndex, value) => {
    setManualGeneratedCase((current) => ({
      ...current,
      steps: current.steps.map((step, currentIndex) =>
        currentIndex === stepIndex ? value : step,
      ),
    }))
  }

  const addManualGeneratedStep = () => {
    setManualGeneratedCase((current) => ({ ...current, steps: [...current.steps, ''] }))
  }

  const removeManualGeneratedStep = (stepIndex) => {
    setManualGeneratedCase((current) => ({
      ...current,
      steps:
        current.steps.length > 1
          ? current.steps.filter((_, currentIndex) => currentIndex !== stepIndex)
          : [''],
    }))
  }

  const saveManualGeneratedCase = (event) => {
    event.preventDefault()

    const normalizedCase = normalizeGeneratedCase({
      ...manualGeneratedCase,
      steps: manualGeneratedCase.steps.map((step) => step.trim()).filter(Boolean),
    })

    if (!normalizedCase.title.trim() || !normalizedCase.steps.length || !normalizedCase.expectedResult.trim()) {
      setGenerationError('Manual test case needs a title, at least one step, and an expected result.')
      return
    }

    setGeneratedTestCases((current) => [...current, normalizedCase])
    setIsManualGeneratedModalOpen(false)
    setGenerationError('')
    setGenerationStatus('Manual test case added to the generated list.')
  }

  const handleSelectTestCase = (testCaseId, checked) => {
    setSelectedTestIds((current) =>
      checked ? [...new Set([...current, testCaseId])] : current.filter((id) => id !== testCaseId),
    )
  }

  const handleSelectAll = (checked) => {
    setSelectedTestIds(checked ? tests.map((testCase) => testCase.id) : [])
  }

  const handleDeleteTestCase = async (testCaseId) => {
    if (!window.confirm('Are you sure you want to delete this test case?')) {
      return
    }

    try {
      setDeletingTestId(testCaseId)
      setError('')
      setMappingError('')
      setStatusMessage('')

      const response = await deleteTest(testCaseId)
      setTests((current) => current.filter((testCase) => testCase.id !== testCaseId))
      setSelectedTestIds((current) => current.filter((id) => id !== testCaseId))
      setMappingResults((current) => current.filter((result) => result.testCaseId !== testCaseId))
      setStatusMessage(response.message || 'Test case deleted successfully.')
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setDeletingTestId('')
    }
  }

  const handleDeleteSelected = async () => {
    if (!selectedTestIds.length) {
      return
    }

    if (!window.confirm('Are you sure you want to delete selected test cases?')) {
      return
    }

    try {
      setBulkDeleting(true)
      setError('')
      setMappingError('')
      setStatusMessage('')

      const idsToDelete = [...selectedTestIds]
      const response = await bulkDeleteTests(idsToDelete)

      setTests((current) => current.filter((testCase) => !idsToDelete.includes(testCase.id)))
      setSelectedTestIds([])
      setMappingResults((current) =>
        current.filter((result) => !idsToDelete.includes(result.testCaseId)),
      )
      setStatusMessage(
        `${response.deletedCount ?? idsToDelete.length} test case(s) deleted successfully.`,
      )
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleMapScripts = async ({ autoRun }) => {
    if (!selectedTestIds.length) {
      setMappingError('Select at least one test case before generating scripts.')
      return
    }

    const selectedTests = tests.filter((testCase) => selectedTestIds.includes(testCase.id))
    const hasExistingScripts = selectedTests.some((testCase) => Boolean(testCase.script))
    const overwriteExisting = hasExistingScripts
      ? window.confirm(
          'Some selected test cases already have scripts. Do you want to overwrite those existing scripts?',
        )
      : false

    try {
      setMappingAction(autoRun ? 'generateRun' : 'generate')
      setMappingError('')
      const response = await mapTestCasesToScripts({
        testCaseIds: selectedTestIds,
        autoRun,
        overwriteExisting,
      })
      setMappingResults(response.scripts || [])
      await loadTests()
    } catch (requestError) {
      setMappingError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          requestError.message,
      )
    } finally {
      setMappingAction('')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-500">Test Library</p>
            <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-3xl">
              Manage manual and automated QA scenarios
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Generate scoped manual coverage from requirements, refine it before saving, and map
              selected cases into Playwright automation scripts.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsGeneratorOpen(true)}
              className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              Generate Test Cases
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Create Test Case
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => handleSelectAll(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Select all test cases
            </label>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {selectedTestIds.length} selected
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={!selectedTestIds.length || bulkDeleting || mappingAction !== ''}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkDeleting ? 'Deleting selected...' : 'Delete Selected'}
            </button>
            <button
              type="button"
              onClick={() => handleMapScripts({ autoRun: false })}
              disabled={mappingAction !== '' || bulkDeleting}
              className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mappingAction === 'generate' ? 'Generating scripts...' : 'Generate Automation Scripts'}
            </button>
            <button
              type="button"
              onClick={() => handleMapScripts({ autoRun: true })}
              disabled={mappingAction !== '' || bulkDeleting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mappingAction === 'generateRun' ? 'Generating & running...' : 'Generate & Run'}
            </button>
          </div>
        </div>
      </section>

      {error ? <ErrorMessage message={error} onRetry={loadTests} /> : null}
      {mappingError ? <ErrorMessage message={mappingError} /> : null}
      {statusMessage ? (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </p>
      ) : null}

      {loading ? (
        <Loader label="Loading test cases..." />
      ) : tests.length ? (
        <section className="grid gap-4">
          {tests.map((testCase) => (
            <TestCaseCard
              key={testCase.id}
              testCase={testCase}
              selectable
              selected={selectedTestIds.includes(testCase.id)}
              onSelect={handleSelectTestCase}
              onDelete={handleDeleteTestCase}
              deleting={
                deletingTestId === testCase.id ||
                (bulkDeleting && selectedTestIds.includes(testCase.id))
              }
              generationResult={mappingResultsById[testCase.id]}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">No test cases found</h2>
          <p className="mt-3 text-sm text-gray-500">
            Create your first QA scenario or generate structured cases from product requirements.
          </p>
        </section>
      )}

      {mappingResults.length ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-slate-950">Automation Mapping Results</h2>
          <div className="mt-5 space-y-4">
            {mappingResults.map((result) => (
              <article key={result.testCaseId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{result.title}</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Status: <span className="font-semibold text-slate-700">{result.status}</span>
                    </p>
                    {result.message ? (
                      <p className="mt-2 text-sm leading-6 text-slate-700">{result.message}</p>
                    ) : null}
                  </div>
                  {result.run ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Run status: {result.run.status}
                    </span>
                  ) : null}
                </div>
                {result.script ? (
                  <details className="mt-4 rounded-lg bg-slate-950 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                      View generated Playwright script
                    </summary>
                    <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-sm leading-7 text-slate-200">
                      <code>{result.script}</code>
                    </pre>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">New Test Case</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Add a fresh QA scenario
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleCreateTest}>
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Title</span>
                <input
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  placeholder="Checkout flow regression"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Description</span>
                <textarea
                  rows="3"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  placeholder="Describe the user journey and expected outcome."
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Preconditions</span>
                <textarea
                  rows="3"
                  value={form.preconditions}
                  onChange={(event) => setForm({ ...form, preconditions: event.target.value })}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Target URL</span>
                  <input
                    value={form.url}
                    onChange={(event) => setForm({ ...form, url: event.target.value })}
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                    placeholder="https://app.example.com/login"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Priority</span>
                  <select
                    value={form.priority}
                    onChange={(event) => setForm({ ...form, priority: event.target.value })}
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-2">
                <AutomationStepEditor
                  steps={form.steps}
                  onChange={(steps) => setForm({ ...form, steps })}
                />
              </div>
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Expected Result</span>
                <textarea
                  rows="3"
                  value={form.expectedResult}
                  onChange={(event) => setForm({ ...form, expectedResult: event.target.value })}
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                />
              </label>
              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Creating...' : 'Save Test Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isGeneratorOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Generate Test Cases</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Generate, refine, and save manual QA coverage
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
                  Paste a feature description, story, acceptance criteria, or document. Generated
                  cases stay editable until you select and save them.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDiscardGenerated}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleGenerateCases}>
              <div className="grid gap-4 md:grid-cols-4">
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Input Type</span>
                  <select
                    value={generatorForm.type}
                    onChange={(event) =>
                      setGeneratorForm({ ...generatorForm, type: event.target.value })
                    }
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  >
                    {generatorTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Coverage Level</span>
                  <select
                    value={generatorForm.coverageLevel}
                    onChange={(event) =>
                      setGeneratorForm({ ...generatorForm, coverageLevel: event.target.value })
                    }
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  >
                    {coverageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Desired Count</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={generatorForm.count}
                    onChange={(event) =>
                      setGeneratorForm({ ...generatorForm, count: event.target.value })
                    }
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  />
                </label>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                  Uses your Testtoria API key and the configured local AI provider.
                </div>
              </div>

              <label className="grid gap-2">
                <span className="text-sm text-gray-500">
                  Feature / User Story / Acceptance Criteria / Document
                </span>
                <textarea
                  required
                  rows="10"
                  value={generatorForm.content}
                  onChange={(event) =>
                    setGeneratorForm({ ...generatorForm, content: event.target.value })
                  }
                  className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                  placeholder="Paste requirements here. Include business rules, validations, roles, states, or known exclusions when available."
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="submit"
                  disabled={generating}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? 'Generating...' : 'Generate Test Cases'}
                </button>
              </div>
            </form>

            {generating ? (
              <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-6">
                <Loader label={generationStage || 'Generating test cases...'} />
              </div>
            ) : null}
            {generationError ? <div className="mt-6"><ErrorMessage message={generationError} /></div> : null}
            {generationStatus ? (
              <p className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {generationStatus}
              </p>
            ) : null}

            {!generating && !generationError && generatedTestCases.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-gray-500">
                No generated cases yet. Paste requirements and generate a draft suite.
              </div>
            ) : null}

            {generatedTestCases.length ? (
              <div className="mt-6 space-y-5">
                <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-700">Feature Summary</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {featureSummary || 'Summary not returned by the AI provider.'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-700">Detected Flows</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detectedFlows.length ? (
                        detectedFlows.map((flow) => (
                          <span key={flow} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                            {flow}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500">No flows returned.</span>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={allGeneratedSelected}
                        onChange={(event) => handleSelectAllGenerated(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Select All
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleShrink}
                        disabled={Boolean(refiningAction)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {refiningAction === 'shrink' ? 'Shrinking...' : 'Shrink'}
                      </button>
                      <button
                        type="button"
                        onClick={() => runRefinement({ mode: 'remove_duplicates' })}
                        disabled={Boolean(refiningAction)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {refiningAction === 'remove_duplicates' ? 'Removing...' : 'Remove Duplicates'}
                      </button>
                      <button
                        type="button"
                        onClick={() => runRefinement({ mode: 'feature_scope_only' })}
                        disabled={Boolean(refiningAction)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {refiningAction === 'feature_scope_only' ? 'Refining...' : 'Feature Scope Only'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddMoreModalOpen(true)}
                        disabled={Boolean(refiningAction)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      >
                        Add More with AI
                      </button>
                      <button
                        type="button"
                        onClick={openManualGeneratedModal}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        Add Manually
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveSelectedGenerated}
                        disabled={savingGenerated || !selectedGeneratedCount}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingGenerated ? 'Saving...' : `Save Selected (${selectedGeneratedCount})`}
                      </button>
                    </div>
                  </div>
                </section>

                {generatedTestCases.map((testCase, index) => (
                  <article
                    key={testCase.localId}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={testCase.selected}
                          onChange={(event) =>
                            handleGeneratedSelect(testCase.localId, event.target.checked)
                          }
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        TC-{index + 1}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {testCase.priority}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {testCase.type}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          {testCase.module}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGeneratedEditing(testCase.localId, !testCase.editing)}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          {testCase.editing ? 'Save Changes' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGenerated(testCase.localId)}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4">
                      <label className="grid gap-2">
                        <span className="text-sm text-gray-500">Title</span>
                        <input
                          value={testCase.title}
                          disabled={!testCase.editing}
                          onChange={(event) =>
                            handleGeneratedCaseChange(testCase.localId, 'title', event.target.value)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-lg font-semibold text-slate-950 outline-none transition focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-600"
                        />
                      </label>
                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="grid gap-2">
                          <span className="text-sm text-gray-500">Priority</span>
                          <select
                            value={testCase.priority}
                            disabled={!testCase.editing}
                            onChange={(event) =>
                              handleGeneratedCaseChange(testCase.localId, 'priority', event.target.value)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                          >
                            {priorityOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2">
                          <span className="text-sm text-gray-500">Type</span>
                          <select
                            value={testCase.type}
                            disabled={!testCase.editing}
                            onChange={(event) =>
                              handleGeneratedCaseChange(testCase.localId, 'type', event.target.value)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                          >
                            {typeOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2">
                          <span className="text-sm text-gray-500">Module</span>
                          <input
                            value={testCase.module}
                            disabled={!testCase.editing}
                            onChange={(event) =>
                              handleGeneratedCaseChange(testCase.localId, 'module', event.target.value)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                          />
                        </label>
                      </div>
                      <label className="grid gap-2">
                        <span className="text-sm text-gray-500">Preconditions</span>
                        <textarea
                          rows="2"
                          value={testCase.preconditions}
                          disabled={!testCase.editing}
                          onChange={(event) =>
                            handleGeneratedCaseChange(testCase.localId, 'preconditions', event.target.value)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                        />
                      </label>
                      <div>
                        <p className="text-sm text-gray-500">Steps</p>
                        <div className="mt-2 grid gap-2">
                          {testCase.steps.map((step, stepIndex) => (
                            <div key={`${testCase.localId}-step-${stepIndex}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <input
                                value={step}
                                disabled={!testCase.editing}
                                onChange={(event) =>
                                  handleGeneratedStepChange(testCase.localId, stepIndex, event.target.value)
                                }
                                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                                placeholder={`Step ${stepIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeGeneratedStep(testCase.localId, stepIndex)}
                                disabled={!testCase.editing}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => addGeneratedStep(testCase.localId)}
                          disabled={!testCase.editing}
                          className="mt-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Add Step
                        </button>
                      </div>
                      <label className="grid gap-2">
                        <span className="text-sm text-gray-500">Expected Result</span>
                        <textarea
                          rows="3"
                          value={testCase.expectedResult}
                          disabled={!testCase.editing}
                          onChange={(event) =>
                            handleGeneratedCaseChange(testCase.localId, 'expectedResult', event.target.value)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isManualGeneratedModalOpen ? (
        <ManualGeneratedCaseModal
          testCase={manualGeneratedCase}
          onChange={handleManualGeneratedCaseChange}
          onStepChange={handleManualGeneratedStepChange}
          onAddStep={addManualGeneratedStep}
          onRemoveStep={removeManualGeneratedStep}
          onClose={() => setIsManualGeneratedModalOpen(false)}
          onSave={saveManualGeneratedCase}
        />
      ) : null}

      {isAddMoreModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Add More with AI</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Expand the current test suite
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMoreModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <label className="mt-5 grid gap-2">
              <span className="text-sm text-gray-500">Optional instruction</span>
              <textarea
                rows="4"
                value={addMoreInstruction}
                onChange={(event) => setAddMoreInstruction(event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="Add more negative scenarios, validation cases, payment failure cases..."
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAddMoreModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  runRefinement({
                    mode: 'expand',
                    instruction: addMoreInstruction || 'Add relevant missing scenarios.',
                  })
                }
                disabled={Boolean(refiningAction)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {refiningAction === 'expand' ? 'Adding...' : 'Add More'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ManualGeneratedCaseModal({
  testCase,
  onChange,
  onStepChange,
  onAddStep,
  onRemoveStep,
  onClose,
  onSave,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Manual Test Case</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Add a test case to the generated list
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={onSave}>
          <label className="grid gap-2">
            <span className="text-sm text-gray-500">Title</span>
            <input
              required
              value={testCase.title}
              onChange={(event) => onChange('title', event.target.value)}
              className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Priority</span>
              <select
                value={testCase.priority}
                onChange={(event) => onChange('priority', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              >
                {priorityOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Type</span>
              <select
                value={testCase.type}
                onChange={(event) => onChange('type', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              >
                {typeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-gray-500">Module</span>
              <input
                value={testCase.module}
                onChange={(event) => onChange('module', event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
              />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm text-gray-500">Preconditions</span>
            <textarea
              rows="2"
              value={testCase.preconditions}
              onChange={(event) => onChange('preconditions', event.target.value)}
              className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
            />
          </label>
          <div>
            <p className="text-sm text-gray-500">Steps</p>
            <div className="mt-2 grid gap-2">
              {testCase.steps.map((step, index) => (
                <div key={`manual-step-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={step}
                    onChange={(event) => onStepChange(index, event.target.value)}
                    className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
                    placeholder={`Step ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveStep(index)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onAddStep}
              className="mt-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Add Step
            </button>
          </div>
          <label className="grid gap-2">
            <span className="text-sm text-gray-500">Expected Result</span>
            <textarea
              required
              rows="3"
              value={testCase.expectedResult}
              onChange={(event) => onChange('expectedResult', event.target.value)}
              className="rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add Test Case
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TestCases
