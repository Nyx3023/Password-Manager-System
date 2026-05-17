import { CATEGORIES } from "@/shared/catalog";

interface CategoryFilterProps {
  active: string | null;
  counts: Record<string, number>;
  onChange: (categoryId: string | null) => void;
}

export function CategoryFilter({ active, counts, onChange }: CategoryFilterProps) {
  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">
      <button
        type="button"
        className={`filter-chip${active === null ? " active" : ""}`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {CATEGORIES.map((cat) => {
        const count = counts[cat.id] ?? 0;
        if (count === 0) return null;
        return (
          <button
            key={cat.id}
            type="button"
            className={`filter-chip${active === cat.id ? " active" : ""}`}
            onClick={() => onChange(cat.id)}
          >
            <span>{cat.emoji}</span>
            {cat.name}
            <span className="count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
