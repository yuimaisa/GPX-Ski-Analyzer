import { parseGpx } from '../gpx/parse';
import { analyzeTrack } from './analyze';
self.onmessage = (event: MessageEvent<{ xml: string; filename: string }>) => {
  try {
    self.postMessage({ result: analyzeTrack(parseGpx(event.data.xml, event.data.filename)) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : '解析できませんでした。別のGPXを選択してください。',
    });
  }
};
