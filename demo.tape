# Jumper TUI Demo — Wizard + Execution
Output docs/demo.gif

Require jumper

Set Shell "zsh"
Set FontSize 14
Set FontFamily "JetBrains Mono,Menlo,monospace"
Set Width 1100
Set Height 650
Set Padding 8
Set Framerate 20
Set PlaybackSpeed 1.5
Set TypingSpeed 35ms
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set WindowBarSize 40

# Type the command
Type "jumper start"
Sleep 500ms
Enter
Sleep 2s

# Stage 1: Environment — select Dev (default, first item)
Sleep 1s
Enter
Sleep 1s

# Stage 2: Platform — select Mobile (arrow down once)
Down
Sleep 400ms
Enter
Sleep 1s

# Stage 3: Vertical — browse a bit then pick Senior Care
Down
Sleep 500ms
Enter
Sleep 1s

# Stage 4: Step — pick at-availability (3rd item)
Down
Sleep 300ms
Down
Sleep 400ms
Enter
Sleep 1s

# Stage 5: Flags — Continue
Sleep 600ms
Enter
Sleep 1s

# Stage 6: Options — count = 1, press enter
Sleep 800ms
Enter
Sleep 1500ms

# Stage 7: Confirm — review, then start
Sleep 2s
Enter

# Execution screen — let it run
Sleep 8s

# Toggle log drawer open
Type "l"
Sleep 3s

# Close logs
Type "l"
Sleep 2s

# Quit
Type "q"
Sleep 1s
