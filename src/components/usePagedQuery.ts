import { useEffect, useState } from "react";

/**
 * 分页列表的加载状态：与 Materials 页同一套写法（按请求键判定"加载中"，组件卸载或键变化时丢弃旧结果）。
 *
 * @param key     决定"这是一次新请求"的所有输入拼成的字符串；变化即重新加载
 * @param fetcher 发请求；只在 key 变化时调用
 */
export function usePagedQuery<T>(key: string, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${key}|${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setFailure(null);
        setLoadedKey(requestKey);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData(null);
        setFailure(error);
        setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
    // fetcher 每次渲染都是新函数；是否重新请求只由 requestKey 决定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return {
    data,
    failure,
    loading: loadedKey !== requestKey,
    reload: () => setReloadToken((value) => value + 1),
  };
}
