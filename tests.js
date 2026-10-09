unit("tests", [], () => {
  function fail(message) {
    throw new Error(message);
  }

  function assertTrue(value, message) {
    if (!value) fail(message || "assertTrue failed");
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      fail((message || "assertEqual failed") + ` (actual=${actual}, expected=${expected})`);
    }
  }

  function assertContains(haystack, needle, message) {
    if (String(haystack).indexOf(String(needle)) === -1) {
      fail((message || "assertContains failed") + ` (needle=${needle})`);
    }
  }

  class LoggerSmokeTests {
    static async run() {
      const cases = [];

      cases.push(function testFormatIncludesFields() {
        const line = Movi.Logger.formatEntry({
          timestamp: "2026-01-01T00:00:00.000Z",
          level: "ERROR",
          category: "Parser",
          code: "MPARSE001",
          operation: "parse-script",
          file: "VID-M01-SCRIPT.md",
          line: 12,
          column: 3,
          message: "Unknown command",
        });

        assertContains(line, "ERROR", "format should include level");
        assertContains(line, "Parser", "format should include category");
        assertContains(line, "MPARSE001", "format should include code");
        assertContains(line, "VID-M01-SCRIPT.md:12:3", "format should include location");
      });

      cases.push(function testTrimUnderCapUnchanged() {
        const text = "abc\nxyz\n";
        const out = Movi.Logger.trimToCap(text, 999);
        assertEqual(out, text, "under-cap should be unchanged");
      });

      cases.push(function testTrimOverCapKeepsTail() {
        const text = "line1\nline2\nline3\nline4\n";
        const out = Movi.Logger.trimToCap(text, 10);
        assertTrue(out.length <= 10, "trimmed length should be <= cap");
      });

      cases.push(function testTrimStartsAtNewlineBoundary() {
        const text = "aaaa\nbbbb\ncccc\ndddd\n";
        const out = Movi.Logger.trimToCap(text, 9);
        assertTrue(out === "dddd\n" || out === "cccc\ndddd\n" || out === "", "trim should keep whole trailing lines");
      });

      cases.push(async function testAppendRunHeaderWritesMarker() {
        const state = {};
        const adapter = {
          async read(path) {
            if (!(path in state)) throw new Error("missing");
            return state[path];
          },
          async write(path, content) {
            state[path] = content;
          },
        };
        const app = { vault: { adapter } };
        const logger = new Movi.Logger(app, { logPath: "movi.log", maxBytes: 4096 });

        await logger.appendRunHeader();
        assertContains(state["movi.log"] || "", "=== RUN ", "run header should include RUN marker");
      });

      cases.push(async function testInfoWritesStructuredEntry() {
        const state = {};
        const adapter = {
          async read(path) {
            if (!(path in state)) throw new Error("missing");
            return state[path];
          },
          async write(path, content) {
            state[path] = content;
          },
        };
        const app = { vault: { adapter } };
        const logger = new Movi.Logger(app, { logPath: "movi.log", maxBytes: 4096 });

        await logger.info("validate-script", "parsed 1 action", { category: "Parser", code: "MPARSE_OK", file: "demo.md" });

        const out = state["movi.log"] || "";
        assertContains(out, "| INFO |", "info should write INFO level");
        assertContains(out, "| Parser |", "info should include category");
        assertContains(out, "| MPARSE_OK |", "info should include code");
        assertContains(out, "| validate-script |", "info should include operation");
      });

      cases.push(async function testAppendRawTrimsAfterMultipleWrites() {
        const state = {};
        const adapter = {
          async read(path) {
            if (!(path in state)) throw new Error("missing");
            return state[path];
          },
          async write(path, content) {
            state[path] = content;
          },
        };
        const app = { vault: { adapter } };
        const logger = new Movi.Logger(app, { logPath: "movi.log", maxBytes: 12 });

        await logger.appendRaw("aaa\nbbb\n");
        await logger.appendRaw("ccc\nddd\n");

        const out = state["movi.log"] || "";
        assertTrue(out.length <= 12, "trimmed log should stay under cap after multiple writes");
        assertContains(out, "ddd", "trimmed log should keep newest tail content");
      });

      return await runCaseList("Logger", cases);
    }
  }

  class ParserSmokeTests {
    static async run() {
      const cases = [];

      cases.push(function testFindScriptSection() {
        const md = "# Note\n\n# Script\nshow a.png for 1s\n\n# Other\n";
        const section = Movi.Parser.extractScriptSection(md, "demo.md");
        assertEqual(section.lines.length, 2, "script section line count");
      });

      cases.push(function testParseValidShowCommand() {
        const md = "# Script\nshow hero.png for 2.5s\n";
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions.length, 1, "one action expected");
        assertEqual(parsed.actions[0].type, "show", "action type");
        assertEqual(parsed.actions[0].image, "hero.png", "image field");
        assertEqual(parsed.actions[0].durationSeconds, 2.5, "duration field");
      });

      cases.push(function testParseShowAndZoomActions() {
        const md = "# Script\nshow hero.png as intro for 3s\nzoom ring to 1.8 for 1.5s\n";
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions.length, 2, "two actions expected");
        assertEqual(parsed.actions[0].type, "show", "first action type");
        assertEqual(parsed.actions[0].name, "intro", "show name field");
        assertEqual(parsed.actions[1].type, "zoom", "second action type");
        assertEqual(parsed.actions[1].targetName, "ring", "zoom target field");
        assertEqual(parsed.actions[1].zoomEnd, 1.8, "zoom end field");
        assertEqual(parsed.actions[1].durationSeconds, 1.5, "zoom duration field");
      });

      cases.push(function testZoomSupportsAsLabel() {
        const md = "# Script\nshow hero.png for 3s\nzoom ring to 1.8 for 1.5s as myZoom\n";
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions[1].name, "myZoom", "zoom label field");
      });

      cases.push(function testCutSupportsAsLabel() {
        const md = "# Script\nshow hero.png for 3s\ncut ring at 1.5 for 1s as myCut\n";
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions[1].name, "myCut", "cut label field");
      });

      cases.push(function testAtLineAnchorsFollowingCaption() {
        const md = '# Script\nshow hero.png for 3s\ncut ring at 1.5 for 1s as myCut\nat myCut+2s\ncaption 1s greeting "Hi"\n';
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        const caption = parsed.actions[2];
        assertEqual(caption.anchorLabel, "myCut", "caption anchor label");
        assertEqual(caption.anchorOffsetSeconds, 2, "caption anchor offset");
      });

      cases.push(function testAtLinePercentForm() {
        const md = '# Script\nshow hero.png for 3s\ncut ring at 1.5 for 1s as myCut\nat myCut 40%\ncaption 1s greeting "Hi"\n';
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions[2].anchorPercent, 40, "caption anchor percent");
      });

      cases.push(function testCaptionWithoutAtHasNoAnchorLabel() {
        const parsed = Movi.Parser.parseMarkdown('# Script\ncaption 1s greeting "Hi"\n', "demo.md");
        assertEqual(parsed.actions[0].anchorLabel, "", "unanchored caption label");
      });

      cases.push(function testAtUnknownLabelErrors() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown('# Script\nshow hero.png for 3s\nat nope\ncaption 1s greeting "Hi"\n', "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.code, "MPARSE011", "unknown label code");
        }
        assertTrue(saw, "at with unknown label should throw");
      });

      cases.push(function testAtMustPrecedeCaption() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown("# Script\nshow hero.png as s1 for 3s\nat s1\nshow other.png for 1s\n", "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.code, "MPARSE013", "at-before-non-caption code");
        }
        assertTrue(saw, "at before show should throw");
      });

      cases.push(function testDanglingAtErrors() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown("# Script\nshow hero.png as s1 for 3s\nat s1\n", "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.code, "MPARSE012", "dangling at code");
        }
        assertTrue(saw, "dangling at should throw");
      });

      cases.push(function testDuplicateLabelAcrossCommandsErrors() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown("# Script\nshow hero.png as dup for 3s\nzoom ring to 1.5 for 1s as dup\n", "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.code, "MPARSE008", "duplicate label code");
        }
        assertTrue(saw, "duplicate label across show/zoom should throw");
      });

      cases.push(function testParseMultipleZoomActionsAfterOneShow() {
        const parsed = Movi.Parser.parseMarkdown("# Script\nshow hero.png for 3s\nzoom aeku_head to 1.8 for 1.5s\nzoom aeono_head to 1.8 for 1.5s\n", "demo.md");
        assertEqual(parsed.actions.length, 3, "three actions expected");
        assertEqual(parsed.actions[1].type, "zoom", "second action zoom");
        assertEqual(parsed.actions[2].type, "zoom", "third action zoom");
        assertEqual(parsed.actions[2].targetName, "aeono_head", "third zoom target");
      });

      cases.push(function testParseCutWithMark() {
        const md = "# Script\nshow hero.png for 3s\ncut ring at 1.5 for 1s\n";
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions.length, 2, "two actions expected");
        assertEqual(parsed.actions[1].type, "cut", "second action type");
        assertEqual(parsed.actions[1].targetName, "ring", "cut target field");
        assertEqual(parsed.actions[1].zoomEnd, 1.5, "cut zoom level field");
        assertEqual(parsed.actions[1].durationSeconds, 1, "cut duration field");
      });

      cases.push(function testParseCutWithoutMark() {
        const md = "# Script\nshow hero.png for 3s\ncut at 1 for 0.5s\n";
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions.length, 2, "two actions expected");
        assertEqual(parsed.actions[1].type, "cut", "second action type");
        assertEqual(parsed.actions[1].targetName, "", "cut target field should be empty when mark omitted");
      });

      cases.push(function testCutWithoutAnyShowStillErrors() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown("# Script\ncut ring at 1.5 for 1s\n", "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.code, "MPARSE010", "cut-without-show code");
          assertEqual(error.line, 2, "cut-without-show line");
        }
        assertTrue(saw, "cut without show should throw");
      });

      cases.push(function testParseCaptionCommand() {
        const md = '# Script\nshow hero.png for 3s\ncaption 2s greeting "Hello there, welcome."\n';
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions.length, 2, "two actions expected");
        assertEqual(parsed.actions[1].type, "caption", "second action type");
        assertEqual(parsed.actions[1].key, "greeting", "caption key field");
        assertEqual(parsed.actions[1].text, "Hello there, welcome.", "caption text field");
        assertEqual(parsed.actions[1].durationSeconds, 2, "caption duration field");
      });

      cases.push(function testParseCaptionDoesNotRequirePriorShow() {
        const md = '# Script\ncaption 1s greeting "Hello."\n';
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions.length, 1, "one action expected");
        assertEqual(parsed.actions[0].type, "caption", "action type");
      });

      cases.push(function testParseCaptionUnescapesQuotesAndNewlines() {
        const md = '# Script\ncaption 1s line1 "She said, \\"hi\\".\\nSee you soon."\n';
        const parsed = Movi.Parser.parseMarkdown(md, "demo.md");
        assertEqual(parsed.actions[0].text, 'She said, "hi".\nSee you soon.', "caption text should unescape quotes and newlines");
      });

      cases.push(function testZoomWithoutAnyShowStillErrors() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown("# Script\nzoom ring to 1.8 for 1s\n", "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.code, "MPARSE009", "zoom-without-show code");
          assertEqual(error.line, 2, "zoom-without-show line");
        }
        assertTrue(saw, "zoom without show should throw");
      });

      cases.push(function testMissingScriptSectionError() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown("# Note\ntext\n", "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.category, "Parser", "error category");
          assertEqual(error.code, "MPARSE001", "error code");
          assertContains(error.message, "# Script", "error message should mention script section");
        }
        assertTrue(saw, "missing section should throw");
      });

      cases.push(function testUnknownCommandError() {
        let saw = false;
        try {
          Movi.Parser.parseMarkdown("# Script\nmovve hero.png for 1s\n", "demo.md");
        } catch (error) {
          saw = true;
          assertEqual(error.code, "MPARSE002", "unknown command code");
          assertEqual(error.line, 2, "error line");
        }
        assertTrue(saw, "unknown command should throw");
      });

      return await runCaseList("Parser", cases);
    }
  }

  async function runCaseList(suiteName, tests) {
    const results = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < tests.length; i += 1) {
      const fn = tests[i];
      const name = fn.name || `${suiteName}-case-${i + 1}`;
      try {
        await fn();
        passed += 1;
        results.push({ suite: suiteName, name, ok: true });
      } catch (error) {
        failed += 1;
        results.push({ suite: suiteName, name, ok: false, message: error && error.message ? error.message : String(error) });
      }
    }

    return { suite: suiteName, passed, failed, results };
  }

  class Test {
    static async runAll(logger) {
      const suites = [await LoggerSmokeTests.run(), await ParserSmokeTests.run()];
      const all = [];
      let passed = 0;
      let failed = 0;

      for (let i = 0; i < suites.length; i += 1) {
        const s = suites[i];
        passed += s.passed;
        failed += s.failed;
        for (let j = 0; j < s.results.length; j += 1) all.push(s.results[j]);
      }

      const summary = `movi smoke tests: passed=${passed} failed=${failed}`;
      if (failed > 0) console.error(summary);
      else console.log(summary);

      if (logger) {
        await logger.info("smoke-tests", summary, { category: "Test", code: failed > 0 ? "MTEST_FAIL" : "MTEST_OK" });
        for (let i = 0; i < all.length; i += 1) {
          const r = all[i];
          if (!r.ok) {
            await logger.error("smoke-tests", "Test", "MTEST_CASE", `${r.suite}/${r.name}: ${r.message}`);
          }
        }
      }

      return { passed, failed, cases: all };
    }
  }

  Object.assign(Movi, {
    Test,
  });
});
