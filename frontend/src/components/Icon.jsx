export default function Icon({ name, size = 16, stroke = 1.5, style = {}, className = "" }) {
  const paths = {
    library:   <><path d="M3 5l9-2 9 2v14l-9 2-9-2V5z"/><path d="M12 3v18"/></>,
    play:      <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none"/>,
    clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    folder:    <path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/>,
    sparkle:   <><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><path d="M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/></>,
    practice:  <><path d="M4 4l16 8L4 20V4z"/><path d="M4 12h16"/></>,
    queue:     <><path d="M4 6h13M4 12h13M4 18h9"/><circle cx="20" cy="18" r="2"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4.8a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.8-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.4-.8a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.8 2-3.4-2-1.5A7 7 0 0 0 19 12z"/></>,
    search:    <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    chat:      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>,
    mic:       <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
    notes:     <><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M16 4v3h3M8 12h8M8 16h6"/></>,
    bookmark:  <path d="M6 4h12v17l-6-4-6 4V4z"/>,
    quiz:      <><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3.5"/><circle cx="12" cy="17.5" r=".5" fill="currentColor"/></>,
    cc:        <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8.5 11.5a2 2 0 1 0 0 1M15.5 11.5a2 2 0 1 0 0 1"/></>,
    dance:     <><circle cx="12" cy="4.5" r="1.5"/><path d="M12 6v6M9 9l3 3 3-3M9 18l3-6 3 6M8 14l-2 4M16 14l2 4"/></>,
    topics:    <><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 6h6a2 2 0 0 1 2 2v2M8 18h6a2 2 0 0 0 2-2v-2"/></>,
    plus:      <path d="M12 5v14M5 12h14"/>,
    arrow:     <path d="M5 12h14M13 6l6 6-6 6"/>,
    download:  <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 18v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></>,
    moon:      <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>,
    sun:       <><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></>,
    chevron:   <path d="M9 6l6 6-6 6"/>,
    chevronDown: <path d="M6 9l6 6 6-6"/>,
    youtube:   <><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M10 9.5l5 2.5-5 2.5v-5z" fill="currentColor" stroke="none"/></>,
    pin:       <><path d="M12 3l5 5-2 2 1 5-4-4-5 5v-3l5-5-2-2 2-3z"/></>,
    flame:     <path d="M12 3c2 4 5 5 5 9a5 5 0 1 1-10 0c0-2 1-3 2-4-.5 2 .5 3 1 3 0-3 1-5 2-8z"/>,
    grid:      <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    list:      <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></>,
    send:      <path d="M4 12l16-8-6 16-3-7-7-1z"/>,
    trash:     <><path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></>,
    check:     <path d="M5 12l4 4 10-10"/>,
    timeline:  <><path d="M3 12h18"/><circle cx="6" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></>,
    extension: <><path d="M7 3h4v3a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3h4v4h-3a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h3v9H7v-4h0a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0H3V7h4V3z"/></>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    layers:    <><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/></>,
    speaker:   <><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></>,
    recent:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    continue:  <><path d="M3 12h18"/><path d="M13 6l6 6-6 6"/></>,
    analyze:   <><path d="M3 3l7 7M21 3l-7 7M12 10v11"/><circle cx="12" cy="10" r="3"/></>,
    x:         <path d="M18 6L6 18M6 6l12 12"/>,
    stop:      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>,
    expand:    <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>,
    compress:  <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/>,
  };

  return (
    <svg
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || null}
    </svg>
  );
}
