import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

export default function FinalReport({ state }) {
  const weaknesses = state.weaknesses || [];
  const plan = state.plan || {};
  const certRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handleExportImage = async () => {
    if (!certRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(certRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `成长证书_${plan.title || '个人成长计划'}_${new Date().toLocaleDateString('zh-CN')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Certificate — exportable area */}
      <div className="notion-card p-8 text-center mb-8 border-2 border-notion-green/20" ref={certRef}>
        <div className="text-6xl mb-4">🏆</div>
        <h2
          className="text-[26px] font-bold text-notion-black mb-2"
          style={{ letterSpacing: '-0.625px', lineHeight: 1.23 }}
        >
          结业证书
        </h2>
        <div className="w-16 h-px bg-notion-warm-gray-300 mx-auto mb-4" />
        <p className="text-notion-warm-gray-500 mb-1">
          恭喜你完成了 <span className="font-bold text-notion-black">{plan.title || '个人成长计划'}</span>
        </p>
        <p className="text-sm text-notion-warm-gray-500 mb-6">
          共完成 {plan.steps?.length || 0} 个学习步骤，覆盖 {weaknesses.length} 个弱点领域
        </p>

        <div className="flex justify-center gap-6 flex-wrap">
          {weaknesses.map((w, i) => (
            <div key={i} className="text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                w.type === 'knowledge' ? 'bg-notion-badge-bg' : 'bg-green-50'
              }`}>
                <span className="text-lg">{w.type === 'knowledge' ? '📚' : '🌱'}</span>
              </div>
              <p className="text-xs font-medium text-notion-black">{w.name}</p>
              <p className="text-xs text-notion-green font-semibold mt-0.5">已改善</p>
            </div>
          ))}
        </div>

        {/* Date and name for sharing */}
        <div className="mt-6 pt-4 border-t border-black/5">
          <p className="text-xs text-notion-warm-gray-400">
            {state.user?.name || '学习者'} · {new Date().toLocaleDateString('zh-CN')}
          </p>
        </div>
      </div>

      {/* Export + share buttons */}
      <div className="flex justify-center gap-3 mb-8">
        <button
          onClick={handleExportImage}
          disabled={exporting}
          className="notion-btn-primary px-6 py-2 disabled:opacity-50"
        >
          {exporting ? '生成中...' : '💾 保存证书图片'}
        </button>
      </div>

      {/* Summary */}
      <div className="notion-card p-6 mb-6">
        <h3
          className="text-[17px] font-bold text-notion-black mb-4"
          style={{ letterSpacing: '-0.25px' }}
        >
          学习历程
        </h3>
        <div className="space-y-2">
          {plan.steps?.map((step, i) => (
            <div key={i} className="flex items-center gap-3 py-1">
              <div className="w-6 h-6 rounded-full bg-notion-green text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                ✓
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-notion-black">{step.title}</p>
                <p className="text-xs text-notion-warm-gray-300">{step.duration_days} 天</p>
              </div>
              <span className="notion-badge" style={{
                background: step.type === 'knowledge' ? '#f2f9ff' : step.type === 'personality' ? '#fff7ed' : '#f0fdf4',
                color: step.type === 'knowledge' ? '#0075de' : step.type === 'personality' ? '#dd5b00' : '#1aae39',
              }}>
                {step.type === 'knowledge' ? '知识' : step.type === 'personality' ? '性格' : '习惯'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-3">
        <button
          onClick={() => window.location.href = '/'}
          className="notion-btn-secondary px-6 py-2"
        >
          重新开始
        </button>
        <button
          onClick={() => window.location.href = '/study'}
          className="notion-btn-primary px-6 py-2"
        >
          查看学习记录
        </button>
      </div>
    </div>
  );
}
