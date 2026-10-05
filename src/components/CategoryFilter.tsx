import { CATEGORIES } from "@/shared/catalog";

interface CategoryFilterProps {
  active: string | null;
  counts: Record<string, number>;
  totpCount?: number;
  onChange: (categoryId: string | null) => void;
}

export function CategoryFilter({ active, counts, totpCount, onChange }: CategoryFilterProps) {
  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">
      <button
        type="button"
        className={`filter-chip${active === null ? " active" : ""}`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {Boolean(totpCount && totpCount > 0) && (
        <button
          type="button"
          className={`filter-chip${active === "totp-only" ? " active" : ""}`}
          onClick={() => onChange(active === "totp-only" ? null : "totp-only")}
        >
          <span>⏱️</span>
          2FA Codes
          <span className="count">{totpCount}</span>
        </button>
      )}
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
