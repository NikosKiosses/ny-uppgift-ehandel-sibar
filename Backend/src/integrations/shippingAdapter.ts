import { z } from 'zod';


const BASE_URL = process.env.POSTNORD_API_URL;
const API_KEY = process.env.POSTNORD_API_KEY;
const TIMEOUT_MS = Number(process.env.POSTNORD_TIMEOUT_MS ?? 5000);
const NUMBER_OF_POINTS = process.env.POSTNORD_SERVICE_POINTS ?? '5';
const SHOP_POSTAL_CODE = process.env.SHOP_POSTAL_CODE;

async function getFromPostNord(path: string, params: Record<string, string>): Promise<unknown> {
  if (!BASE_URL || !API_KEY) throw new Error('POSTNORD_API_URL or POSTNORD_API_KEY is missing in .env');
  const query = new URLSearchParams({ ...params, apikey: API_KEY });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS} ms` : 'network error';
    throw new Error(`PostNord ${path}: ${reason}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`PostNord ${path} answered ${response.status} ${body.slice(0, 300)}`);
  }
  return response.json();
}

const ServicePointsAnswer = z.object({
  servicePointInformationResponse: z.object({
    servicePoints: z
      .array(
        z.object({
          servicePointId: z.coerce.string(),
          name: z.string(),
          visitingAddress: z.object({
            streetName: z.string().optional(),
            streetNumber: z.coerce.string().optional(),
            postalCode: z.coerce.string().optional(),
            city: z.string().optional(),
          }),
        }),
      )
      .default([]),
  }),
});

export type ServicePoint = { id: string; name: string; address: string };

export async function findServicePoints(postalCode: string): Promise<ServicePoint[]> {
  const raw = await getFromPostNord('/businesslocation/v5/servicepoints/nearest/byaddress', {
    returnType: 'json',
    countryCode: 'SE',
    postalCode,
    numberOfServicePoints: NUMBER_OF_POINTS,
  });

  const answer = ServicePointsAnswer.safeParse(raw);
  if (!answer.success) {
    throw new Error(`Unexpected service point answer from PostNord: ${z.prettifyError(answer.error)}`);
  }

  const points = answer.data.servicePointInformationResponse.servicePoints.map((p) => {
    const a = p.visitingAddress;
    const street = [a.streetName, a.streetNumber].filter(Boolean).join(' ');
    return { id: p.servicePointId, name: p.name, address: [street, a.city].filter(Boolean).join(', ') };
  });
  console.log(`[shipping] ${points.length} service points near ${postalCode}`);
  return points;
}

const TransitItem = z.object({
  service: z.object({
    basicServiceCode: z.coerce.string(),
    name: z.string().optional(),
    additionalServices: z.unknown().optional(),
  }),
  estimatedTimeOfArrival: z
    .object({
      timeOfArrival: z.string().optional(),
      dayRangeOfArrival: z.object({ daysMinimum: z.number(), daysMaximum: z.number() }).optional(),
    })
    .optional(),
  isBookable: z.boolean().optional(),
  errorMessage: z.string().optional(),
});
const TransitAnswer = z.array(TransitItem);

export type DeliveryEstimate = { date: string | null; daysMin: number | null; daysMax: number | null };
export type DeliveryEstimates = { service_point: DeliveryEstimate | null; home: DeliveryEstimate | null };


const SERVICE_CODES = { service_point: '19', home: '17' } as const;

function nowInSweden(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }) 
    .replace(' ', 'T');
}

export async function getDeliveryEstimates(toPostalCode: string): Promise<DeliveryEstimates> {
  if (!SHOP_POSTAL_CODE) throw new Error('SHOP_POSTAL_CODE is missing in .env');
  const raw = await getFromPostNord('/transport/v2/transittime/addresstoaddress', {
    startTime: nowInSweden(),
    originPostalCode: SHOP_POSTAL_CODE,
    originCountryCode: 'SE',
    destinationPostalCode: toPostalCode,
    destinationCountryCode: 'SE',
  });

  const answer = TransitAnswer.safeParse(raw);
  if (!answer.success) {
    throw new Error(`Unexpected transit time answer from PostNord: ${z.prettifyError(answer.error)}`);
  }

  const pick = (code: string): DeliveryEstimate | null => {
    const item = answer.data.find(
      (t) => t.service.basicServiceCode === code && !t.service.additionalServices && t.estimatedTimeOfArrival,
    );
    const eta = item?.estimatedTimeOfArrival;
    if (!eta) return null;
    if (eta.timeOfArrival) {
      return { date: eta.timeOfArrival.slice(0, 10), daysMin: null, daysMax: null };
    }
    if (eta.dayRangeOfArrival) {
      const range = eta.dayRangeOfArrival;
      return { date: null, daysMin: range.daysMinimum, daysMax: range.daysMaximum };
    }
    return null;
  };

  const estimates = {
    service_point: pick(SERVICE_CODES.service_point),
    home: pick(SERVICE_CODES.home),
  };

  if (!estimates.service_point && !estimates.home) {
    const codes: string[] = Object.values(SERVICE_CODES);
    const reasons = answer.data
      .filter((t) => codes.includes(t.service.basicServiceCode))
      .map((t) => t.errorMessage)
      .filter(Boolean)
      .join(' | ');
    throw new Error(`PostNord could not calculate delivery time: ${reasons || 'no estimate'}`);
  }

  console.log(`[shipping] Delivery ${SHOP_POSTAL_CODE} → ${toPostalCode}:`, JSON.stringify(estimates));
  return estimates;
}