import { CATEGORIES } from "@/shared/catalog";

interface StepCategoryProps {
  selected: string | null;
  onSelect: (categoryId: string) => void;
}

export function StepCategory({ selected, onSelect }: StepCategoryProps) {
  return (
    <div className="step-body">
      <div className="big-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`big-tile${selected === cat.id ? " active" : ""}`}
            onClick={() => onSelect(cat.id)}
          >
            <span className="big-tile-emoji">{cat.emoji}</span>
            <span className="big-tile-label">{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
