export const SHIPPING_METHODS = ['service_point', 'home'] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

const PRICES: Record<ShippingMethod, number> = {
  service_point: Number(process.env.SHIPPING_PRICE_SERVICE_POINT ?? 59),
  home: Number(process.env.SHIPPING_PRICE_HOME ?? 99),
};
const FREE_FROM = Number(process.env.FREE_SHIPPING_FROM ?? 500);

export const METHOD_NAMES: Record<ShippingMethod, string> = {
  service_point: 'PostNord – hämta hos ombud',
  home: 'PostNord – hemleverans',
};

export function shippingPrice(method: ShippingMethod, subtotal: number): number {
  return subtotal >= FREE_FROM ? 0 : PRICES[method];
}

export function shippingQuote(subtotal: number) {
  return {
    freeShippingFrom: FREE_FROM,
    leftForFreeShipping: Math.max(0, FREE_FROM - subtotal),
    methods: SHIPPING_METHODS.map((method) => ({
      method,
      name: METHOD_NAMES[method],
      price: shippingPrice(method, subtotal),
    })),
  };
}