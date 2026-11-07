'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analysis } from '../types/analysis';
import { MAX_FILE_BYTES } from '../lib/gpx/parse';
export function useAnalyzer() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [resultId, setResultId] = useState(0);
  const [filename, setFilename] = useState('');
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
      worker.current?.terminate();
      abort.current?.abort();
    },
    [],
  );
  const load = useCallback(async (file?: File) => {
    const id = ++sequence.current;
    worker.current?.terminate();
    abort.current?.abort();
    setError(null);
    setBusy(true);
    try {
      let xml: string;
      let name: string;
      if (file) {
        if (!/\.gpx$/i.test(file.name)) throw new Error('.gpx形式のファイルを選択してください。');
        if (file.size > MAX_FILE_BYTES) throw new Error('ファイルは15MB以下にしてください。');
        name = file.name;
        xml = await file.text();
      } else {
        const controller = new AbortController();
        abort.current = controller;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/samples/hakuba-synthetic.gpx`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error('サンプルを読み込めませんでした。もう一度お試しください。');
        xml = await response.text();
        name = 'hakuba-synthetic.gpx';
      }
      if (id !== sequence.current) return;
      const current = new Worker(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/analysis-worker.js`, {
        type: 'module',
      });
      worker.current = current;
      current.onmessage = (event: MessageEvent<{ result?: Analysis; error?: string }>) => {
        if (id !== sequence.current) return;
        if (event.data.result) {
          setAnalysis(event.data.result);
          setResultId(id);
          setFilename(name);
          setSample(!file);
        } else setError(event.data.error ?? '解析できませんでした。');
        setBusy(false);
        current.terminate();
        worker.current = null;
      };
      current.onerror = () => {
        if (id === sequence.current) {
          setError('解析処理を開始できませんでした。再読み込みしてお試しください。');
          setBusy(false);
        }
        current.terminate();
      };
      current.postMessage({ xml, filename: name });
    } catch (e) {
      if (id === sequence.current) {
        setError(e instanceof Error ? e.message : '読み込めませんでした。');
        setBusy(false);
      }
    }
  }, []);
  return { analysis, filename, sample, busy, error, load, resultId };
}
