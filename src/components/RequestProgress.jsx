export default function RequestProgress({ status, paid = false }) {
  const stopped = ['rejected', 'declined'].includes(status);
  const completed = paid ? 4 : status === 'accepted' ? 3 : ['approved', 'declined'].includes(status) ? 2 : 1;
  const labels = ['Submitted', 'Approved', 'Accepted', 'Paid · Sandbox'];
  return <div className="request-progress">
    <ol aria-label="Request progress">{labels.map((label, index) => <li key={label} className={index < completed ? 'step-done' : 'step-waiting'} aria-current={!stopped && index === completed - 1 ? 'step' : undefined}><span className="step-dot" aria-hidden="true">{index < completed ? '✓' : index + 1}</span><span>{label}<span className="sr-only">{index < completed ? ': complete' : ': not completed'}</span></span></li>)}</ol>
    {stopped && <p className="muted">{status === 'rejected' ? 'The business declined this request.' : 'The customer declined this quote.'} This request is closed.</p>}
  </div>;
}
