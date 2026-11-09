"""教案生成一致性与正文 C 算法的独立暴力对照。"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from gen_cs408_knowledge_lessons import CODE, OUT, build


class KnowledgeLessonsTest(unittest.TestCase):
    def test_generated_snapshot_is_current(self):
        self.assertEqual(json.loads(OUT.read_text()), build())

    @unittest.skipUnless(shutil.which("cc"), "需要 C 编译器验证正文算法")
    def test_lesson_algorithms_against_brute_force(self):
        prefix = """
#include <assert.h>
#include <stdio.h>
#define MAXV 3
typedef struct {
    int numVertices, numEdges;
    char VerticesList[MAXV];
    int Edge[MAXV][MAXV];
} MGraph;
"""
        checks = """
int main(void) {
    int a[5], res[5];
    for (int n = 1; n <= 5; ++n) {
        int combinations = 1;
        for (int i = 0; i < n; ++i) combinations *= 7;
        for (int mask = 0; mask < combinations; ++mask) {
            int x = mask;
            for (int i = 0; i < n; ++i) { a[i] = x % 7 - 3; x /= 7; }
            calMulMax(a, res, n);
            for (int i = 0; i < n; ++i) {
                int expected = a[i] * a[i];
                for (int j = i; j < n; ++j)
                    if (a[i] * a[j] > expected) expected = a[i] * a[j];
                assert(res[i] == expected);
            }
        }
    }
    int sample[] = {1, 4, -9, 6};
    int result[4];
    calMulMax(sample, result, 4);
    assert(result[0] == 6 && result[1] == 24 && result[2] == 81 && result[3] == 36);
    for (int mask = 0; mask < 512; ++mask) {
        MGraph g = {0};
        g.numVertices = 3;
        int balance[3] = {0}, expected = 0;
        for (int i = 0; i < 3; ++i) {
            g.VerticesList[i] = 'a' + i;
            for (int j = 0; j < 3; ++j) {
                g.Edge[i][j] = (mask >> (3 * i + j)) & 1;
                if (g.Edge[i][j]) { ++balance[i]; --balance[j]; }
            }
        }
        for (int i = 0; i < 3; ++i) expected += balance[i] > 0;
        assert(printVertices(g) == expected);
    }
    return 0;
}
"""
        program = prefix + CODE["cs408-2023-q41"] + "\n" + CODE["cs408-2025-q41"] + checks
        with tempfile.TemporaryDirectory(prefix="cs408-lesson-") as directory:
            source, binary = Path(directory) / "lesson.c", Path(directory) / "lesson"
            source.write_text(program)
            subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(binary)],
                           check=True, capture_output=True, text=True)
            subprocess.run([str(binary)], check=True, capture_output=True, text=True, timeout=10)


if __name__ == "__main__":
    unittest.main()
