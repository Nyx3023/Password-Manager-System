import { getCategory } from "@/shared/catalog";
import { ServiceIcon } from "../ServiceIcon";

interface StepServiceProps {
  categoryId: string;
  selected: string | null;
  onSelect: (subcategoryId: string) => void;
}

export function StepService({
  categoryId,
  selected,
  onSelect,
}: StepServiceProps) {
  const category = getCategory(categoryId);
  if (!category) return <p className="muted">No services found.</p>;

  return (
    <div className="step-body">
      <div className="service-grid">
        {category.subcategories.map((sub) => (
          <button
            key={sub.id}
            type="button"
            className={`service-tile${selected === sub.id ? " active" : ""}`}
            onClick={() => onSelect(sub.id)}
          >
            <ServiceIcon
              categoryId={categoryId}
              subcategoryId={sub.id}
              size="lg"
            />
            <span className="service-tile-label">{sub.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
