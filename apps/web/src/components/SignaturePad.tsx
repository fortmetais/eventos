import { useRef, type PointerEvent } from "react";
export type Signature = { x: number; y: number }[][];
export function SignatureImage({ value }: { value: Signature }) {
  return (
    <svg
      viewBox="0 0 1000 300"
      role="img"
      aria-label="Assinatura do responsável"
      className="signature-image"
    >
      {value.map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
export function SignaturePad({
  value,
  onChange,
}: {
  value: Signature;
  onChange: (value: Signature) => void;
}) {
  const current = useRef(value);
  current.current = value;
  const pointer = useRef<number | null>(null);
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(1000, ((e.clientX - rect.left) / rect.width) * 1000),
      ),
      y: Math.max(
        0,
        Math.min(300, ((e.clientY - rect.top) / rect.height) * 300),
      ),
    };
  };
  const change = (next: Signature) => {
    current.current = next;
    onChange(next);
  };
  return (
    <div className="signature-pad">
      <p id="signature-help">
        Assine com o dedo, mouse ou caneta dentro da área abaixo.
      </p>
      <svg
        viewBox="0 0 1000 300"
        preserveAspectRatio="none"
        role="img"
        aria-label="Área para desenhar a assinatura"
        aria-describedby="signature-help"
        onPointerDown={(e) => {
          if (
            pointer.current !== null ||
            current.current.length >= 40 ||
            e.button !== 0
          )
            return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer.current = e.pointerId;
          change([...current.current, [point(e)]]);
        }}
        onPointerMove={(e) => {
          if (pointer.current !== e.pointerId) return;
          const strokes = current.current;
          if (strokes[strokes.length - 1].length >= 400) return;
          change([
            ...strokes.slice(0, -1),
            [...strokes[strokes.length - 1], point(e)],
          ]);
        }}
        onPointerUp={(e) => {
          if (pointer.current === e.pointerId) {
            pointer.current = null;
            const strokes = current.current;
            if (strokes[strokes.length - 1]?.length < 2)
              change(strokes.slice(0, -1));
          }
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
      >
        {value.map((stroke, i) => (
          <polyline
            key={i}
            points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <button
        type="button"
        className="button outline"
        onClick={() => {
          pointer.current = null;
          change([]);
        }}
      >
        Limpar assinatura
      </button>
    </div>
  );
}
