export const usd = (n: number | null | undefined) =>
  n == null
    ? "-"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
