export interface Review {
  id: string;
  customerName: string;
  customerEmail: string | null;
  title: string;
  content: string;
  rating: number;
  status: string;
  createdAt: string | Date;
  imageUrl: string | null;
  images: string[];
  isVerified: boolean;
  merchantReply: string | null;
  product: {
    id: string;
    title: string;
    handle: string;
    imageUrl: string | null;
  };
}

export interface StatusCounts {
  all: number;
  pending: number;
  published: number;
  rejected: number;
}
