(()=>{
  const client=window.IOTA_AD_CLIENT||"";
  if(!/^ca-pub-\d+$/.test(client))return;
  const script=document.createElement("script");
  script.async=true;
  script.crossOrigin="anonymous";
  script.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.append(script);
})();
