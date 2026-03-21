type Props = {
  score: number | null;
  calculadoEm: string | null;
};

export default function ScoreFidelidade({ score, calculadoEm }: Props) {
  if (score === null) return null;
const scoreNum = typeof score === "string" ? parseFloat(score) : score;
const estrelas = Math.round(scoreNum);
  
  const data = calculadoEm
    ? new Date(calculadoEm).toLocaleDateString("pt-BR")
    : null;

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <svg
            key={i}
            className={`w-4 h-4 ${
              i <= estrelas ? "text-amber-400" : "text-zinc-200"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-sm font-semibold text-zinc-800">{scoreNum.toFixed(1)}</span>
      <span className="text-xs text-zinc-400">fidelidade</span>
      {data && (
        <span className="text-xs text-zinc-300">• atualizado {data}</span>
      )}
    </div>
  );
}