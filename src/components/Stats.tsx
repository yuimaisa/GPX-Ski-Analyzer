import {
  ArrowUpRight,
  Clock3,
  TrendingUp,
  Pause,
  Mountain,
  MoveUpRight,
  Timer,
} from 'lucide-react';
import type { Analysis } from '../types/analysis';
import { km, number, duration } from '../lib/presentation';
export function Stats({ analysis: { stats: s, runs, lifts } }: { analysis: Analysis }) {
  const gapLifts = lifts.filter((l) => l.inferredFromGap).length;
  const metrics = [
    { label: '滑走距離', value: km(s.skiDistance), unit: 'km' },
    { label: '滑走本数', value: number(runs.length), unit: '本' },
    { label: '最高速度', value: number(s.maxSpeed, 1), unit: 'km/h' },
    { label: '累積下降', value: number(s.descent), unit: 'm' },
  ];
  return (
    <>
      <section className="metrics" aria-label="全体統計">
        {metrics.map((m) => (
          <div className="metric" key={m.label}>
            <h2>{m.label}</h2>
            <p>
              {m.value}
              <span>{m.unit}</span>
            </p>
          </div>
        ))}
      </section>
      <dl className="secondary-stats">
        <div
          title={
            gapLifts > 0
              ? `有意な上昇区間から推定（うちGPS欠損区間からの推定 ${gapLifts}回・距離速度非加算、徒歩登坂とは区別しません）`
              : '有意な上昇区間から推定（徒歩登坂とは区別しません）'
          }
        >
          <dt>
            <ArrowUpRight />
            リフト回数（推定）
          </dt>
          <dd>
            {number(s.liftCount)} <span>回</span>
          </dd>
        </div>
        <div>
          <dt>
            <Clock3 />
            滑走時間
          </dt>
          <dd>{duration(s.skiSeconds)}</dd>
        </div>
        <div>
          <dt>
            <MoveUpRight />
            総移動距離
          </dt>
          <dd>
            {km(s.distance)} <span>km</span>
          </dd>
        </div>
        <div>
          <dt>
            <Timer />
            平均滑走速度
          </dt>
          <dd>
            {number(s.averageSkiSpeed, 1)} <span>km/h</span>
          </dd>
        </div>
        <div>
          <dt>
            <TrendingUp />
            上昇
          </dt>
          <dd>
            {number(s.ascent)} <span>m</span> / {duration(s.uphillSeconds)}
          </dd>
        </div>
        <div>
          <dt>
            <Pause />
            停止時間
          </dt>
          <dd>{duration(s.stoppedSeconds)}</dd>
        </div>
        <div>
          <dt>
            <Mountain />
            標高範囲
          </dt>
          <dd>
            {number(s.minElevation)}–{number(s.maxElevation)} <span>m</span>
          </dd>
        </div>
      </dl>
    </>
  );
}
