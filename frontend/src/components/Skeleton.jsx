/** Content-shaped loading placeholder announced as busy to assistive technology. */
export default function Skeleton({ rows = 3 }) {
  return (
    <div className="skeleton-stack" aria-label="Loading content" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton-block" />
          <span className="skeleton-block skeleton-short" />
        </div>
      ))}
    </div>
  );
}
