window.IOTA_GAMES = [];
window.IOTA_CATEGORIES = [];
window.IOTA_API_READY = fetch("/api/games", { headers: { accept: "application/json" } })
  .then(async response => {
    if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data.games)) throw new Error("The catalog response is invalid.");
    window.IOTA_GAMES = data.games;
    window.IOTA_CATEGORIES = [...new Set(data.games.flatMap(game => game.genre))].sort();
    return data.games;
  });
window.iotaAllGames = () => window.IOTA_GAMES;
