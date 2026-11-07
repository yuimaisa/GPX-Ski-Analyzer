import { List, X } from 'lucide-react';
import type { SkiRun } from '../types/analysis';
import { clock, duration, km, number } from '../lib/presentation';
export function RunTable({
  runs,
  selected,
  onSelect,
}: {
  runs: SkiRun[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <section className="panel runs-panel" aria-labelledby="runs-heading">
      <div className="panel-heading">
        <h2 id="runs-heading">
          <List />
          滑走一覧 <span className="count">{runs.length}本</span>
        </h2>
        {selected != null && (
          <button className="text-button" onClick={() => onSelect(null)}>
            <X size={15} />
            選択を解除
          </button>
        )}
      </div>
      {runs.length === 0 ? (
        <p className="empty-message">
          条件を満たす滑走区間が見つかりませんでした。時刻・標高の欠損や短い記録は、滑走と判定できない場合があります。
        </p>
      ) : (
        <>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="滑走区間の表（横にスクロールできます）"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">滑走</th>
                  <th scope="col">
                    開始–終了 <span>JST</span>
                  </th>
                  <th scope="col">滑走時間</th>
                  <th scope="col">距離</th>
                  <th scope="col">下降</th>
                  <th scope="col">平均速度</th>
                  <th scope="col">最高速度</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={run.id === selected ? 'selected' : ''}
                    onClick={() => onSelect(run.id === selected ? null : run.id)}
                  >
                    <th scope="row">
                      <button
                        className="run-button"
                        aria-pressed={run.id === selected}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(run.id === selected ? null : run.id);
                        }}
                      >
                        <span className="run-index">{String(run.id).padStart(2, '0')}</span>本目
                      </button>
                    </th>
                    <td>
                      {clock(run.start)} <span className="muted">–</span> {clock(run.end)}
                    </td>
                    <td title={`開始から終了まで ${duration(run.elapsed)}（停止を含む）`}>
                      {duration(run.duration)}
                    </td>
                    <td>
                      {km(run.distance)} <span>km</span>
                    </td>
                    <td>
                      {number(run.descent)} <span>m</span>
                    </td>
                    <td>
                      {number(run.averageSpeed, 1)} <span>km/h</span>
                    </td>
                    <td>
                      {number(run.maxSpeed, 1)} <span>km/h</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">
            行を選ぶと地図とグラフで区間を強調します。滑走時間・距離は停止を除く値です。
          </p>
        </>
      )}
    </section>
  );
}
