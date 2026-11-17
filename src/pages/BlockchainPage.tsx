import { useEffect, useState } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import {
  Blocks,
  CheckCircle2,
  Code2,
  ExternalLink,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { parseApiJson } from '../lib/apiClient';
import type {
  BlockchainNetworkStatus,
  BlockchainRecord,
  ReportRecord,
} from '../types/stockproof';

interface BlockchainPageProps {
  reports: ReportRecord[];
  activeReportId: string;
  blockchainStatus: BlockchainNetworkStatus;
  blockchainRecords: BlockchainRecord[];
  onSelectReport: (reportId: string) => void;
  onRecordCreated: (report: ReportRecord, record: BlockchainRecord) => void;
}

const STOCKPROOF_ABI = [
  'function registerReport(string reportId, string reportHash, string verificationStatus) external',
  'function registerEvidence(string reportId, string evidenceHash, string verificationStatus) external',
  'function getReport(string reportId) external view returns (string reportHash, string verificationStatus, uint256 timestamp, address registeredBy, uint256 version)',
];

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export function BlockchainPage({
  reports,
  activeReportId,
  blockchainStatus,
  blockchainRecords,
  onSelectReport,
  onRecordCreated,
}: BlockchainPageProps) {
  const { getAuthHeaders } = useAuth();
  const activeReport =
    reports.find((r) => r.id === activeReportId) || reports[0];

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showContract, setShowContract] = useState(false);
  const [contractSource, setContractSource] = useState<string | null>(null);

  useEffect(() => {
    if (showContract && !contractSource) {
      fetch('/api/contract-source')
        .then((r) => parseApiJson<{ source?: string }>(r, 'Không thể tải hợp đồng.'))
        .then((d) => setContractSource(d.source || ''))
        .catch(() => setContractSource('// Không thể tải mã nguồn hợp đồng.'));
    }
  }, [showContract, contractSource]);

  const handleConnectWallet = async () => {
    setErrorMsg(null);
    setActionMsg(null);
    if (!window.ethereum) {
      setErrorMsg(
        'Chưa phát hiện ví EVM trên trình duyệt (ví dụ MetaMask). Bạn có thể dùng chế độ Mô phỏng Demo bên dưới để ghi nhận thử nghiệm không cần ví.',
      );
      return;
    }

    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      let network = await provider.getNetwork();

      if (Number(network.chainId) !== 43113) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xa869' }],
          });
        } catch {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xa869',
                chainName: 'Avalanche Fuji C-Chain',
                nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
                rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
                blockExplorerUrls: ['https://testnet.snowtrace.io/'],
              },
            ],
          });
        }
        network = await provider.getNetwork();
      }

      setWalletAddress(address);
      setWalletChainId(Number(network.chainId));
      setActionMsg(
        `Đã kết nối ví: ${address.slice(0, 8)}...${address.slice(-4)}`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Đã hủy kết nối ví.',
      );
    }
  };

  const handleAnchorLiveWallet = async () => {
    if (!activeReport || !activeReport.evidence_report || !window.ethereum) {
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setActionMsg(null);

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(
        blockchainStatus.contract_address,
        STOCKPROOF_ABI,
        signer,
      );

      const overall = activeReport.evidence_report.summary.overall_status;
      const tx = await contract.registerEvidence(
        activeReport.id,
        activeReport.evidence_report.evidence_hash,
        overall,
      );
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;

      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/reports/${activeReport.id}/blockchain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          tx_hash: txHash,
          contract_address: blockchainStatus.contract_address,
          mode: 'LIVE_FUJI_WALLET',
        }),
      });
      const data = await parseApiJson<{
        report?: ReportRecord;
        blockchain_record?: BlockchainRecord;
      }>(res, 'Lưu bản ghi thất bại.');

      if (data.report && data.blockchain_record) {
        onRecordCreated(data.report, data.blockchain_record);
      }
      setActionMsg(`Đã ghi nhận lên Avalanche Fuji Testnet: ${txHash}`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Giao dịch Fuji thực tế thất bại hoặc bị từ chối.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoSimulation = async () => {
    if (!activeReport || !activeReport.evidence_report) return;
    setSubmitting(true);
    setErrorMsg(null);
    setActionMsg(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/reports/${activeReport.id}/blockchain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          contract_address: blockchainStatus.contract_address,
          mode: 'DEMO_SIMULATION',
        }),
      });
      const data = await parseApiJson<{
        report?: ReportRecord;
        blockchain_record?: BlockchainRecord;
      }>(res, 'Ghi bản mô phỏng thất bại.');

      if (data.report && data.blockchain_record) {
        onRecordCreated(data.report, data.blockchain_record);
      }
      setActionMsg(
        'Đã ghi nhận bản mô phỏng Demo cục bộ (được đánh dấu rõ là DEMO_SIMULATION).',
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Mô phỏng Demo thất bại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#F8FAFC]">
            Sổ cái Blockchain — Avalanche Fuji Testnet
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Lưu dấu mã băm SHA-256 của báo cáo và bằng chứng qua hợp đồng thông
            minh StockProofRegistry.sol. Tuyệt đối không đưa nội dung báo cáo mật
            lên chuỗi.
          </p>
        </div>

        <select
          aria-label="Chọn báo cáo để ghi lên Blockchain"
          value={activeReport?.id || ''}
          onChange={(e) => onSelectReport(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#172033] border border-slate-700 text-xs text-[#F8FAFC] self-start"
        >
          {reports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} ({r.ticker} · {r.reporting_period})
            </option>
          ))}
        </select>
      </div>

      {/* Network + Registration Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Blocks className="h-4 w-4 text-[#06B6D4]" />
              <h2 className="text-sm font-semibold text-[#F8FAFC]">
                Cấu hình mạng lưới
              </h2>
            </div>
            <span
              className={`text-xs font-medium ${
                blockchainStatus.connected
                  ? 'text-[#22C55E]'
                  : 'text-[#F59E0B]'
              }`}
            >
              {blockchainStatus.connected ? 'Đã kết nối RPC' : 'Chưa kết nối'}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-[#94A3B8]">Mạng lưới</span>
              <span className="text-[#F8FAFC]">{blockchainStatus.network}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-[#94A3B8]">Chain ID</span>
              <span className="font-mono text-[#F8FAFC] tabular-nums">
                {blockchainStatus.chain_id}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-[#94A3B8]">Block Fuji hiện tại</span>
              <span className="font-mono text-[#CBD5E1] tabular-nums">
                {blockchainStatus.block_number !== null
                  ? `#${blockchainStatus.block_number.toLocaleString()}`
                  : 'Ngoại tuyến / Sandbox'}
              </span>
            </div>
            <div className="py-1.5">
              <span className="text-[#94A3B8] block">
                Địa chỉ hợp đồng StockProofRegistry
              </span>
              <span className="font-mono text-[#06B6D4] break-all">
                {blockchainStatus.contract_address}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowContract((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA]"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>
              {showContract
                ? 'Ẩn mã nguồn StockProofRegistry.sol'
                : 'Xem mã nguồn StockProofRegistry.sol'}
            </span>
          </button>
        </section>

        <section className="lg:col-span-7 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            Ghi nhận mã băm xác minh ({activeReport?.id || 'Không có'})
          </h2>

          {activeReport?.evidence_report ? (
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
              <div>
                <span className="text-[#94A3B8] block">
                  Mã băm SHA-256 tài liệu
                </span>
                <span className="font-mono text-[#CBD5E1] break-all">
                  {activeReport.document_hash}
                </span>
              </div>
              <div>
                <span className="text-[#94A3B8] block">
                  Mã băm SHA-256 gói bằng chứng
                </span>
                <span className="font-mono text-[#22C55E] break-all">
                  {activeReport.evidence_report.evidence_hash}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800/70">
                <span className="text-[#94A3B8]">Trạng thái tổng thể</span>
                <span className="font-mono text-[#F8FAFC]">
                  {activeReport.evidence_report.summary.overall_status}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#94A3B8]">
              Chọn một báo cáo đã xác minh để ghi mã băm.
            </div>
          )}

          {errorMsg && (
            <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3">
              {errorMsg}
            </div>
          )}
          {actionMsg && (
            <div className="flex items-start gap-2 text-xs text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg p-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-all">{actionMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {!walletAddress ? (
              <button
                type="button"
                onClick={handleConnectWallet}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                <Wallet className="h-3.5 w-3.5" />
                <span>Kết nối ví Fuji</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !activeReport?.evidence_report}
                onClick={handleAnchorLiveWallet}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#22C55E]/20 hover:bg-[#22C55E]/30 border border-[#22C55E]/40 text-xs font-medium text-[#22C55E] whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>
                  {submitting
                    ? 'Đang gửi giao dịch...'
                    : `Ký & Ghi lên Fuji (${walletAddress.slice(0, 6)}... | Chain ${walletChainId})`}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={submitting || !activeReport?.evidence_report}
              onClick={handleDemoSimulation}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-[#F59E0B] whitespace-nowrap shrink-0"
            >
              <span>Ghi bản mô phỏng Demo</span>
            </button>
          </div>

          <p className="text-[11px] text-[#94A3B8]">
            Chế độ Mô phỏng Demo tạo bản ghi cục bộ được đánh dấu rõ ràng và
            không tạo liên kết Snowtrace giả. Giao dịch Fuji thực tế yêu cầu ví
            EVM có AVAX thử nghiệm trên Chain ID 43113.
          </p>
        </section>
      </div>

      {/* Smart Contract Source */}
      {showContract && contractSource && (
        <section className="bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            contracts/StockProofRegistry.sol
          </h2>
          <pre className="bg-[#0B1120] border border-slate-800 rounded-lg p-4 text-[11px] font-mono text-[#CBD5E1] overflow-x-auto max-h-80">
            {contractSource}
          </pre>
        </section>
      )}

      {/* Recorded Entries Table */}
      <section className="bg-[#172033] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            Danh sách bản ghi Blockchain
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[#94A3B8] bg-[#111827]/60">
                <th className="py-3 px-4 font-medium">Báo cáo</th>
                <th className="py-3 px-4 font-medium">Chế độ</th>
                <th className="py-3 px-4 font-medium">Trạng thái</th>
                <th className="py-3 px-4 font-medium">Mã băm bằng chứng</th>
                <th className="py-3 px-4 font-medium">Mã giao dịch / Bản ghi</th>
                <th className="py-3 px-4 font-medium text-right">Trình duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {blockchainRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-xs text-[#94A3B8]"
                  >
                    Chưa có bản ghi Blockchain nào. Hãy kết nối ví Fuji hoặc ghi
                    bản mô phỏng Demo ở trên.
                  </td>
                </tr>
              ) : (
                blockchainRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#111827]/40">
                    <td className="py-3 px-4 font-mono text-[#F8FAFC] whitespace-nowrap">
                      {rec.report_id}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={
                          rec.mode === 'LIVE_FUJI_WALLET'
                            ? 'text-[#22C55E] font-medium'
                            : 'text-[#F59E0B] font-medium'
                        }
                      >
                        {rec.mode === 'LIVE_FUJI_WALLET'
                          ? 'Ví Fuji thực tế'
                          : 'Mô phỏng Demo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#CBD5E1] whitespace-nowrap">
                      {rec.verification_status}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#94A3B8] whitespace-nowrap">
                      {rec.evidence_hash.slice(0, 14)}...
                    </td>
                    <td className="py-3 px-4 font-mono text-[#CBD5E1] whitespace-nowrap">
                      {rec.transaction_hash.slice(0, 18)}...
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {rec.explorer_url ? (
                        <a
                          href={rec.explorer_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#3B82F6] hover:underline"
                        >
                          <span>Snowtrace</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-[#94A3B8]">Mô phỏng cục bộ</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
