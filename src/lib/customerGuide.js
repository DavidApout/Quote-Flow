export function detailQuestion(description, serviceName = '') {
  const text = `${description} ${serviceName}`.toLowerCase();
  if (/shirt|clothing|apparel|hoodie|uniform/.test(text)) return 'What sizes and colors do you need, and is your logo or artwork ready?';
  if (/cater|food|meal|cake/.test(text)) return 'Where is the event, and are there dietary requirements or menu preferences?';
  if (/clean|landscap|repair|mural|window/.test(text)) return 'What is the location or project size, and are there access requirements?';
  if (/design|brand|print|logo/.test(text)) return 'What style, dimensions, and files or examples should the business know about?';
  if (/photo|video/.test(text)) return 'Where will this take place, how long is needed, and what should be captured?';
  return 'What specifications, location, or preferences would help the business quote accurately?';
}

export function buildRequestSummary({ description, deadline, details, followUp = '', answer = '' }) {
  return [description.trim(), deadline.trim() && `Timing: ${deadline.trim()}`, details.trim() && `Details: ${details.trim()}`, answer.trim() && `Follow-up — ${followUp}\n${answer.trim()}`].filter(Boolean).join('\n\n');
}
