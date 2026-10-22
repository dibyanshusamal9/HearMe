/** Official JAL lockup, stored locally so cabin use needs no internet. */
export function JalBrand({ label = 'HearMe' }: { label?: string }) {
  return <span className="jal-brand"><img src="/img/jal-logo.png" alt="Japan Airlines" /><span className="jal-brand__service">{label}</span></span>;
}
