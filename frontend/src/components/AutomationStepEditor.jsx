import {
  actionOptions,
  assertionOptions,
  createEmptyAutomationStep,
  normalizeAutomationStep,
  stepNeedsActionValue,
  stepNeedsAttributeName,
  stepNeedsExpectedValue,
} from '../utils/automationSteps'

function AutomationStepEditor({
  steps,
  onChange,
  disabled = false,
  allowSelectorFinder = false,
  onUseFinderSelector,
}) {
  const normalizedSteps = (Array.isArray(steps) && steps.length ? steps : [createEmptyAutomationStep()])
    .map(normalizeAutomationStep)

  const updateStep = (index, field, value) => {
    updateStepFields(index, { [field]: value })
  }

  const updateStepFields = (index, changes) => {
    onChange(
      normalizedSteps.map((step, currentIndex) =>
        currentIndex === index ? { ...step, ...changes } : step,
      ),
    )
  }

  const addStep = () => {
    onChange([...normalizedSteps, createEmptyAutomationStep()])
  }

  const removeStep = (index) => {
    onChange(
      normalizedSteps.length > 1
        ? normalizedSteps.filter((_, currentIndex) => currentIndex !== index)
        : [createEmptyAutomationStep()],
    )
  }

  const moveStep = (index, direction) => {
    const nextIndex = index + direction

    if (nextIndex < 0 || nextIndex >= normalizedSteps.length) {
      return
    }

    const nextSteps = [...normalizedSteps]
    const [step] = nextSteps.splice(index, 1)
    nextSteps.splice(nextIndex, 0, step)
    onChange(nextSteps)
  }

  return (
    <div>
      <p className="text-sm text-gray-500">Steps</p>
      <div className="mt-2 grid gap-3">
        {normalizedSteps.map((step, index) => (
          <div key={`automation-step-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-semibold text-slate-700">Step {index + 1}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => moveStep(index, -1)}
                  disabled={disabled || index === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move Up
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(index, 1)}
                  disabled={disabled || index === normalizedSteps.length - 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move Down
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  disabled={disabled}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remove Step
                </button>
              </div>
            </div>

            <label className="mt-3 grid gap-2">
              <span className="text-sm text-gray-500">Step Description</span>
              <textarea
                rows="2"
                value={step.description}
                disabled={disabled}
                onChange={(event) => updateStep(index, 'description', event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                placeholder="Click Login button"
              />
            </label>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_180px_180px]">
              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Selector</span>
                <input
                  value={step.selector}
                  disabled={disabled}
                  onChange={(event) => {
                    updateStepFields(index, {
                      selector: event.target.value,
                      selectorSource: event.target.value ? 'manual' : '',
                    })
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                  placeholder={'[data-testid="login-button"], #loginBtn, input[name="email"]'}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Action</span>
                <select
                  value={step.action}
                  disabled={disabled}
                  onChange={(event) => updateStep(index, 'action', event.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                >
                  {actionOptions.map((option) => (
                    <option key={option.value || 'manual'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-gray-500">Assertion</span>
                <select
                  value={step.assertion}
                  disabled={disabled}
                  onChange={(event) => updateStep(index, 'assertion', event.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                >
                  {assertionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {step.assertion === 'isClickable' ? (
              <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                Clickable checks visible + enabled.
              </p>
            ) : null}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {stepNeedsActionValue(step) ? (
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">
                    {step.action === 'navigate' ? 'URL' : 'Action Value'}
                  </span>
                  <input
                    value={step.value}
                    disabled={disabled}
                    onChange={(event) => updateStep(index, 'value', event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                    placeholder={step.action === 'press' ? 'Enter' : step.action === 'navigate' ? 'https://example.com' : 'Value'}
                  />
                </label>
              ) : null}

              {stepNeedsAttributeName(step) ? (
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Attribute Name</span>
                  <input
                    value={step.attributeName}
                    disabled={disabled}
                    onChange={(event) => updateStep(index, 'attributeName', event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                    placeholder="href"
                  />
                </label>
              ) : null}

              {stepNeedsExpectedValue(step) ? (
                <label className="grid gap-2">
                  <span className="text-sm text-gray-500">Assertion Expected Value</span>
                  <input
                    value={step.expectedValue}
                    disabled={disabled}
                    onChange={(event) => updateStep(index, 'expectedValue', event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 disabled:bg-slate-100"
                    placeholder={step.assertion === 'hasCount' ? '1' : 'Expected value'}
                  />
                </label>
              ) : null}
            </div>

            {allowSelectorFinder ? (
              <button
                type="button"
                onClick={() => onUseFinderSelector?.(index)}
                disabled={disabled}
                className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use Finder Selector
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addStep}
        disabled={disabled}
        className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Add Step
      </button>
    </div>
  )
}

export default AutomationStepEditor
