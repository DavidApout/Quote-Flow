const paths = {
  brand: 'M5 4h14v12H9l-4 4V4m4 4h6m-6 4h4',
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  inbox: 'M4 4h16l2 11v5H2v-5L4 4m-2 11h6l2 3h4l2-3h6',
  services: 'M3 5h18v15H3zM8 5V3h8v2M3 10h18m-11 0v3h4v-3',
  widget: 'M3 4h18v16H3zM3 9h18M7 6.5h.01M10 6.5h.01M9 13l-2 2 2 2m6-4 2 2-2 2',
  settings: 'M4 7h16M4 17h16M9 4v6m6 4v6',
  refresh: 'M20 7v5h-5m5-1a8 8 0 1 0-2 7',
  document: 'M5 3h10l4 4v14H5zM14 3v5h5M9 12h6m-6 4h4',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
};
export default function Icon({ name }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.document} /></svg>;
}
