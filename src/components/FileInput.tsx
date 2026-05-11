import { useRef } from "react";

interface Props {
  label: string;
  required?: boolean;
  file: File | null;
  onFile: (file: File | null) => void;
  hint?: string;
}

export function FileInput({ label, required, file, onFile, hint }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className={`fileinput ${file ? "filled" : required ? "required" : ""}`}>
      <span className="label">
        {label} {required && <span style={{ color: "var(--err)" }}>*</span>}
      </span>
      <input
        ref={ref}
        type="file"
        accept=".xlsx"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <span className="filename">📄 {file.name}</span>
      ) : (
        <span className="empty">{hint ?? "Hacé clic para subir un .xlsx"}</span>
      )}
    </label>
  );
}
