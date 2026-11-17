import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Link2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import type {
  EvidenceReport,
  FujiAnchorRecord,
  Language,
} from '../types/stockproof.ts';

interface FujiRpcStatus {
  networkName: string;
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  blockNumber: number;
  rpcVerified: boolean;
  explorerBaseUrl: string;
}

interface EvidenceFujiViewProps {
  report: EvidenceReport | null;
  fujiAnchor: FujiAnchorRecord | null;
  anchorHistory: FujiAnchorRecord[];
  lang: Language;
  onAnchorFuji: (txHash?: string) => Promise<void>;
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export function EvidenceFujiView({
  report,
  fujiAnchor,
  anchorHistory,
  lang,
  onAnchorFuji,
}: EvidenceFujiViewProps) {
  const t = COPY[lang].fuji;
  const [rpcStatus, setRpcStatus] = useState<FujiRpcStatus | null>(null);
  const [contractSource, setContractSource] = useState<string>('');
  const [anchoring, setAnchoring] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showContractSource, setShowContractSource] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/fuji-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setRpcStatus(data as FujiRpcStatus);
      })
      .catch(() => {});

    fetch('/api/contract-source')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { source?: string } | null) => {
        if (data?.source) setContractSource(data.source);
      })
      .catch(() => {});
  }, []);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Clipboard blocked in some headless contexts
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.reportId}-evidence-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleServerAnchor = async () => {
    setErrorMsg(null);
    setAnchoring(true);
    try {
      await onAnchorFuji();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to anchor on Avalanche Fuji',
      );
    } finally {
      setAnchoring(false);
    }
  };

  const handleWalletAnchor = async () => {
    setErrorMsg(null);
    const eth = (window as unknown as { ethereum?: Eip1193Provider })
      .ethereum;
    if (!eth) {
      setErrorMsg(
        'No browser Web3 wallet detected. Use "Anchor Hash on Fuji" to record directly via the Fuji RPC registry.',
      );
      return;
    }
    if (!report) return;

    setAnchoring(true);
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa869' }], // 43113 Avalanche Fuji
      });
      const accounts = (await eth.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const from = accounts[0];
      const txHash = (await eth.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from,
            to: rpcStatus?.contractAddress ?? '0x7F4c9E218A6b40D32E8819F5b12C4A03D9E8104B',
            value: '0x0',
            data: report.reportHash,
          },
        ],
      })) as string;
      await onAnchorFuji(txHash);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Wallet transaction cancelled',
      );
    } finally {
      setAnchoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-slate-900">
              {t.heading}
            </h1>
            <p className="text-sm text-slate-600 mt-1">{t.subheading}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleDownloadJson}
              disabled={!report}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Evidence JSON</span>
            </button>

            <button
              type="button"
              onClick={handleWalletAnchor}
              disabled={!report || anchoring}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.walletAnchorBtn}</span>
            </button>

            <button
              type="button"
              onClick={handleServerAnchor}
              disabled={!report || anchoring}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{anchoring ? t.anchoring : t.anchorBtn}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <p role="alert" className="text-xs text-red-700">
            {errorMsg}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500">
              {t.reportHash}
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all flex-1">
                {report?.reportHash ?? '—'}
              </code>
              {report && (
                <button
                  type="button"
                  onClick={() => handleCopy('reportHash', report.reportHash)}
                  aria-label="Copy Evidence Report SHA-256 hash"
                  className="p-2 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md shrink-0"
                >
                  {copiedKey === 'reportHash' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500">
              {t.contractAddr}
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all flex-1">
                {fujiAnchor?.contractAddress ??
                  rpcStatus?.contractAddress ??
                  '0x7F4c9E218A6b40D32E8819F5b12C4A03D9E8104B'}
              </code>
              <a
                href={`https://testnet.snowtrace.io/address/${
                  fujiAnchor?.contractAddress ??
                  rpcStatus?.contractAddress ??
                  '0x7F4c9E218A6b40D32E8819F5b12C4A03D9E8104B'
                }`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50 whitespace-nowrap shrink-0"
              >
                <span>Contract</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        {fujiAnchor ? (
          <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="md:col-span-2 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Anchored on {fujiAnchor.networkName} (Chain {fujiAnchor.chainId}) ·{' '}
                  {fujiAnchor.rpcVerified ? 'Live Fuji RPC' : 'Testnet Record'}
                </span>
              </div>
              <div className="text-xs text-slate-500">{t.txHash}</div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all flex-1">
                  {fujiAnchor.txHash}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy('txHash', fujiAnchor.txHash)}
                  aria-label="Copy Avalanche Fuji transaction hash"
                  className="p-2 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md shrink-0"
                >
                  {copiedKey === 'txHash' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-2">
              <div className="text-xs text-slate-600 font-mono tabular-nums">
                {t.blockHeight}: #{fujiAnchor.blockNumber.toLocaleString('en-US')}
              </div>
              <a
                href={fujiAnchor.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <span>{t.openExplorer}</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        ) : (
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
            <span>{t.notAnchored}</span>
            {rpcStatus && (
              <span className="font-mono tabular-nums text-slate-500">
                Fuji Head Block #{rpcStatus.blockNumber.toLocaleString('en-US')} ·{' '}
                {rpcStatus.rpcVerified ? 'RPC Connected' : 'Local Reference'}
              </span>
            )}
          </div>
        )}
      </div>

      {anchorHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {t.historyHeading}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Anchor ID</th>
                  <th className="py-2.5 px-3">Verdict</th>
                  <th className="py-2.5 px-3 text-right">Block</th>
                  <th className="py-2.5 px-3">Report Hash</th>
                  <th className="py-2.5 px-4 text-right">Fuji Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {anchorHistory.map((item) => (
                  <tr key={item.anchorId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-900">
                      {item.anchorId}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {item.overallVerdict} ({item.verifiedCount}/{item.totalClaims})
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      #{item.blockNumber.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {item.reportHash.slice(0, 14)}...{item.reportHash.slice(-8)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <a
                        href={item.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium"
                      >
                        <span>Snowtrace</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {t.contractHeading}
            </h2>
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              Avalanche Fuji Testnet · Chain ID 43113
            </span>
          </div>
          <button
            type="button"
            aria-expanded={showContractSource}
            onClick={() => setShowContractSource((prev) => !prev)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {showContractSource ? 'Hide Source' : 'Inspect Contract'}
          </button>
        </div>
        {showContractSource && (
          <pre className="p-5 border-t border-slate-200 text-xs font-mono text-slate-800 bg-slate-50 overflow-x-auto leading-relaxed">
            {contractSource || '// Loading StockProofRegistry.sol...'}
          </pre>
        )}
      </div>
    </div>
  );
}
