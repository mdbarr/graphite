# graphite
Git Graph Visualization


```
Usage: graphite [options]

Options:
  --version       Show version number                                  [boolean]
  --background    svg background color                [string] [default: "#333"]
  --data          include html data attributes on commits nodes in graph
                                                      [boolean] [default: false]
  --descriptions  include commit descriptions in graph[boolean] [default: false]
  --filename      file name to use when saving results
                                                 [string] [default: "graph.svg"]
  --head          use the current HEAD instead of primary branch HEAD
                                                      [boolean] [default: false]
  --labels        label commits in graph              [boolean] [default: false]
  --limit         maximum number of commits to follow
                                                    [number] [default: Infinity]
  --primary       primary branch name               [string] [default: "master"]
  --repository    path to the git repository
                                 [string] [default: "/home/mark/repos/graphite"]
  --save          save results to a file rather than printing to stdout
                                                       [boolean] [default: true]
  --shape         shape to draw for commits in graph
                    [string] [choices: "circle", "hexagon"] [default: "hexagon"]
  --size          size of graph rows in pixels            [number] [default: 10]
  --stashes       include stashes in graph            [boolean] [default: false]
  --strokeWidth   stroke width for svg elements in pixels  [number] [default: 2]
  --textColor     svg text color                      [string] [default: "#FFF"]
  --titles        include html title attributes on commit nodes in the graph
                                                      [boolean] [default: false]
  --config        Path to JSON config file
  -h, --help      Show help                                            [boolean]
  ```
