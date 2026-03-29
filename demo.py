import sys
import heapq
from collections import defaultdict

def getMaximumSum(N, K, A):
    groups = defaultdict(list)

    # Step 1: Group by remainder
    for x in A:
        r = x % K
        groups[r].append(x)

    # Step 2: Sort each group in descending order
    for r in groups:
        groups[r].sort(reverse=True)

    # Step 3: Max heap -> (-value, remainder, index in group)
    heap = []
    for r in groups:
        heapq.heappush(heap, (-groups[r][0], r, 0))

    prev_rem = -1
    total_sum = 0

    # Step 4: Greedy selection
    while heap:
        temp = []
        found = False

        while heap:
            val, r, idx = heapq.heappop(heap)

            if r != prev_rem:
                # Select this element
                total_sum += -val
                prev_rem = r
                found = True

                # Push next element from same group
                if idx + 1 < len(groups[r]):
                    heapq.heappush(heap, (-groups[r][idx + 1], r, idx + 1))
                break
            else:
                temp.append((val, r, idx))

        # Push back skipped elements
        for item in temp:
            heapq.heappush(heap, item)

        if not found:
            break

    return total_sum


def main():
    input = sys.stdin.read
    data = list(map(int, input().split()))

    N = data[0]
    K = data[1]
    A = data[2:]

    print(getMaximumSum(N, K, A))


if __name__ == "__main__":
    main()