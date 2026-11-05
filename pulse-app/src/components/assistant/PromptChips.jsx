/** Suggested prompts shown above the assistant input bar. */
export default function PromptChips({ prompts, disabled, onPick }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          disabled={disabled}
          className="glass-card shrink-0 rounded-full px-3.5 py-2 text-[11px] font-medium text-mist-dim transition-all active:scale-95 disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
