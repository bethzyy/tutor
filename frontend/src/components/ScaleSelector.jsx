export default function ScaleSelector({ options, value, onChange }) {
  if (!options || options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((label, idx) => {
        const isSelected = value === idx;
        return (
          <button
            key={idx}
            onClick={() => onChange(idx, label, idx + 1)}
            className={`
              px-4 py-2.5 rounded-lg text-sm font-medium transition-all border
              ${isSelected
                ? 'bg-notion-blue text-white border-notion-blue shadow-sm'
                : 'bg-white text-notion-black border-black/10 hover:border-black/20 hover:bg-notion-warm-white'
              }
            `}
          >
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
