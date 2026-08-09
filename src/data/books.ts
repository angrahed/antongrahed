export interface BookItem {
	author: string;
	firstPublished?: number;
	id: `book-${string}`;
	note: string;
	title: string;
	url?: string;
}

export const bookItems: readonly BookItem[] = [];
