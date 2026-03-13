// metadata.js - novi fajl

class MetadataManager {
  constructor() {
    this.cache = new Map();
    this.fetchQueue = [];
    this.isFetching = false;
  }

  async fetchMetadataFast(streamUrl) {
    // 1. Koristi cache prvo
    if (this.cache.has(streamUrl)) {
      return this.cache.get(streamUrl);
    }

    // 2. Koristi RDS direktno sa streama
    const rdsData = this.extractRDSFromStream(streamUrl);
    if (rdsData) {
      this.cache.set(streamUrl, rdsData);
      return rdsData;
    }

    // 3. iTunes fallback sa timeout-om
    const itunesArt = await Promise.race([
      this.fetchFromiTunes(rdsData.artist, rdsData.track),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      )
    ]).catch(() => this.getDefaultArtwork());

    const metadata = { ...rdsData, artwork: itunesArt };
    this.cache.set(streamUrl, metadata);
    return metadata;
  }

  extractRDSFromStream(streamUrl) {
    // Direktno čitaj RDS iz stream headers ili WebSocket
    // Ovo zavisi od stream protokola - SHOUTcast/Icecast imaju RDS
  }

  async fetchFromiTunes(artist, track) {
    const response = await fetch(
      `https://itunes.apple.com/search?term=${artist}+${track}&entity=song&limit=1`
    );
    const data = await response.json();
    return data.results[0]?.artworkUrl100;
  }

  getDefaultArtwork() {
    // Placeholder koji se može prikazati odmah
    return 'url-to-default-icon';
  }

  // Pozovi pri svakoj promeni trenutne pesme
  onMetadataChange(callback) {
    this.metadataObserver = callback;
  }
}
