/**
 * Đọc phản hồi JSON từ API một cách an toàn.
 * Tránh lỗi "Unexpected token '<', \"<!doctype \"... is not valid JSON"
 * khi máy chủ hoặc cổng proxy trả về trang lỗi HTML (413, 502, 504, 404...).
 */
export async function parseApiJson<T = Record<string, unknown>>(
  res: Response,
  fallbackErrorMessage: string,
): Promise<T> {
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`${fallbackErrorMessage} (HTTP ${res.status})`);
    }
    return {} as T;
  }

  if (trimmed.startsWith('<')) {
    if (res.status === 502 || res.status === 504) {
      throw new Error(
        `Quá thời gian xử lý từ cổng kết nối (HTTP ${res.status}). Tài liệu lớn đang xử lý chậm, vui lòng thử lại.`,
      );
    }
    if (res.status === 413) {
      throw new Error(
        'Dung lượng tệp tải lên vượt quá giới hạn cho phép của máy chủ/cổng kết nối (HTTP 413).',
      );
    }
    throw new Error(
      `Máy chủ trả về trang HTML thay vì JSON (HTTP ${res.status}). Vui lòng kiểm tra kết nối hoặc thử tải lại trang.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      res.ok
        ? 'Phản hồi từ máy chủ không đúng định dạng JSON hợp lệ.'
        : `${fallbackErrorMessage} (HTTP ${res.status})`,
    );
  }

  if (!res.ok) {
    const errObj = parsed as { error?: string; message?: string };
    throw new Error(
      errObj?.error || errObj?.message || `${fallbackErrorMessage} (HTTP ${res.status})`,
    );
  }

  return parsed as T;
}
