import type { Review, StatusCounts } from "../utils/reviews-types";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

interface ReviewsTableProps {
  reviews: Review[];
  counts: StatusCounts;
  totalFiltered: number;
  page: number;
  totalPages: number;
  currentFilter: string;
  searchQuery: string;
  selectedReviews: string[];
  isLoading: boolean;
  onFilterChange: (status: string) => void;
  onSearchChange: (value: string) => void;
  onToggleSelectAll: (e: any) => void;
  onToggleReview: (id: string) => void;
  onOpenReviewDetail: (review: Review) => void;
  onGoToPage: (page: number) => void;
}

export default function ReviewsTable({
  reviews,
  counts,
  totalFiltered,
  page,
  totalPages,
  currentFilter,
  searchQuery,
  selectedReviews,
  isLoading,
  onFilterChange,
  onSearchChange,
  onToggleSelectAll,
  onToggleReview,
  onOpenReviewDetail,
  onGoToPage,
}: ReviewsTableProps) {
  const startItem = (page - 1) * 25 + 1;
  const endItem = Math.min(page * 25, totalFiltered);

  return (
    <s-section>

    </s-section>
  );
}
