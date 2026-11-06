"use client";
export function Input({ label, hint, error, id, className = "", ...rest }) {
  return (
    <div className={`kit-field ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} className={`kit-input${error ? " err" : ""}`} aria-invalid={!!error || undefined} aria-describedby={error && id ? id + "-err" : undefined} {...rest} />
      {error ? <span className="kit-err" id={id && id + "-err"}>⚠ {error}</span> : hint ? <span className="kit-hint">{hint}</span> : null}
    </div>
  );
}

export function Select({ label, hint, error, id, options, className = "", ...rest }) {
  return (
    <div className={`kit-field ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} className={`kit-select${error ? " err" : ""}`} {...rest}>
        {options.map((o) => typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error ? <span className="kit-err">⚠ {error}</span> : hint ? <span className="kit-hint">{hint}</span> : null}
    </div>
  );
}

export function Textarea({ label, hint, error, id, className = "", ...rest }) {
  return (
    <div className={`kit-field ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <textarea id={id} className={`kit-textarea${error ? " err" : ""}`} rows={3} {...rest} />
      {error ? <span className="kit-err">⚠ {error}</span> : hint ? <span className="kit-hint">{hint}</span> : null}
    </div>
  );
}
