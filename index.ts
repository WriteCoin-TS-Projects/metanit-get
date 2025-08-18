import axios from "axios";
import * as cheerio from 'cheerio'

class Data {
    url = "https://metanit.com"
}

type Link = [string, string]
type Folder = { name: string, links: Link[] }
type Parsed = [Folder[] | Link[], string]
type ParsedRecursion = Parsed | Array<Parsed | ParsedRecursion>

class MetanitParser {
    private data: Data = new Data()
    // словарь для кеширования страниц сайта (в рамках одного процесса). Прагматичной цели для парсинга при этом не подразумевается
    private htmls: Map<string, string> = new Map()
    // ссылки обучающих руководств, в шапке сайта
    private tutorialLinks: [string, string][] = []

    async getHtml(url: string) {
        if (!this.htmls.has(url)) {
            let result: string

            try {
                const { data: content } = await axios.get<string>(url)
                this.htmls.set(url, content)
                result = content
            } catch (error) {
                if (error instanceof Error) {
                    console.error(`Ошибка при запросе ${url}: ${error.message}`)
                }
                throw error
            }

            return result
        } else {
            return this.htmls.get(url)
        }
    }

    // получение ссылок на базовой странице
    async getTutorialLinks() {
        console.log("Получение ссылок руководств")

        if (this.tutorialLinks.length > 0) {
            console.log("Список ссылок не пустой, возврат результата")
            return this.tutorialLinks
        }

        let content: string

        try {
            const html = await this.getHtml(this.data.url)

            if (html) {
                content = html
            } else {
                throw Error()
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error("Не удалось получить ссылки. Ошибка выше")
            }
            throw error
        }

        const $ = cheerio.load(content)

        const $a = $('.mainmenu > li > a')

        $a.each((_, element) => {
            // console.log(element.tagName)
            const href = $(element).attr('href')
            if (href) {
                const fullUrl = new URL(href, this.data.url).href
                const name = $(element).text()
                this.tutorialLinks.push([fullUrl, name])
            }
        })

        return this.tutorialLinks
    }

    // результат при парсинге страницы раздела - ссылки на следующие материалы в виде массива и контент
    // результат при парсинге страницы руководства - массив объектов с названиями глав и массивом параграфов (материалов) и контент
    parsePage(html: string): Parsed {
        // переменные результата
        let links: Array<[string, string]> = []
        let content: string | null
        // структура глав (при парсинге руководства)
        let tree: Array<{ name: string, links: [string, string][]}> = []

        const $ = cheerio.load(html)
        const $innerContainer = $(".innercontainer")

        const err = Error("Не удалось получить содержание страницы или главы")

        let innerHtml = $innerContainer.html()

        if (!innerHtml) {
            throw err
        }

        const $2 = cheerio.load(innerHtml)

        // поиск навигации при парсинге в разделе
        const $a = $2(".navmenu > a")

        if ($a.length > 0) {
            $a.each((_, element) => {
                const href = $2(element).attr('href')
                if (href) {
                    const fullUrl = new URL(href, this.data.url).href
                    const name = $2(element).text()
                    links.push([fullUrl, name])
                }
            })
        } else {
            // получение структуры глав и параграфов при парсинге в руководстве
            const $fileTree = $2(".filetree > li")

            if ($fileTree.length <= 0) {
                throw err
            }

            $fileTree.each((_, element) => {
                let innerHtml = $2(element).html()
                if (innerHtml) {
                    const $_folder = cheerio.load(innerHtml)
                    // получение названия главы
                    const $folder = $_folder('.folder')
                    const name = $folder.text()
                    // получение параграфов
                    const paragraphs: Array<[string, string]> = []
                    const $files = $_folder('.file > a')

                    if ($files.length <= 0) {
                        return
                    }
                    $files.each((_, element) => {
                        const href = $_folder(element).attr('href')
                        let url = ""
                        if (href) {
                            url = new URL(href, this.data.url).href
                        }
                        const name = $_folder(element).text()
                        paragraphs.push([url, name])
                    })

                    // добавление в структуру
                    tree.push({
                        name: name,
                        links: paragraphs
                    })
                }
            })
        }

        // получение содержания страницы
        const $itemCenter = $2(".item.center")

        content = $itemCenter.html()

        if (!content) {
            throw err
        }

        return [links, content]
    }

    // результат - ссылки на следующие материалы в виде массива и контент (на главной странице)
    async getMainContent(): Promise<Parsed> {
        let html: string

        try {
            const response = await this.getHtml(this.data.url)

            if (response) {
                html = response
            } else {
                throw Error()
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error("Не удалось получить содержание главной страницы. Ошибка выше")
            }
            throw error
        }

        const [links, content] = this.parsePage(html)

        return [links, content]
    }

    isChapter(link: Folder | Link): boolean {
        if (Array.isArray(link) && link.length === 2) {
            return true
        } else if ('name' in link) {
            return false
        }
        throw Error("Ошибка определения типа спарсированной страницы")
    }

    // остается парсинг цельных страниц
    // притом с параметром рекурсивного или нет
    // при рекурсивном, если парсится раздел, то возможного повтора результатов парсинга следует избежать
    // в разделах также ссылки на руководства даются в самом содержании, из которого отдельным образом нужно добывать ссылки и парсить при рекурсии
    // при парсинге руководств такой задачи нет, при рекурсии там просто последовательный обход параграфов в главах по боковой структуре на сайте
    async getPage(url: string, recursive: boolean = false, previousPage?: Parsed): Promise<ParsedRecursion> {
        let html: string

        try {
            const response = await this.getHtml(url)

            if (response) {
                html = response
            } else {
                throw Error()
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Не удалось получить html страницы ${url}. Ошибка выше`)
            }
            throw error
        }

        const parsed = this.parsePage(html)

        
        // условие остановки рекурсии - одинаковая структура в боковой панели, т.е. ссылок у разделов или папок с файлами у руководств
        if (previousPage && previousPage[0].length === parsed[0].length) {
            // проверка на одинаковое содержимое
            
            for (let i = 0; i < previousPage[0].length; i++) {
                const linksPrevious = previousPage[0][i]
                const linksPage = parsed[0][i]

                if (!linksPrevious || !linksPage) {
                    throw Error(`Обнаружено недопустимое отсутствие ссылок на стадии получения url: ${url}`)
                }

                if (Array.isArray(linksPrevious) && linksPrevious.length === 2 && Array.isArray(linksPage) && linksPage.length === 2) {
                    // условие остановки - сравнение первых элементов кортежа, т.е. URL (второй элемент, отвечающий за название, вероятно, необязательно)
                    if (linksPrevious[0] === linksPage[0]) {
                        recursive = false
                        break
                    }
                } else if ('links' in linksPrevious && 'links' in linksPage) {
                    // условие остановки - сравнение первых параграфов
                    const linkPrevious = linksPrevious.links[0]
                    const linkPage = linksPage.links[0]

                    if (!linkPrevious || !linkPage) {
                        throw Error(`Обнаружено недопустимое отсутствие ссылок на стадии получения url: ${url}`)
                    }

                    if (linkPrevious[0] === linkPage[0]) {
                        recursive = false
                        break
                    }
                }
            }
        }

        if (recursive) {
            const [links, _] = parsed
            const result: ParsedRecursion = []

            let firstParsedNotFirst = false

            for (const linksElement of links) {
                // проверка, что кортеж и значит ссылка раздела (не руководства)
                if (Array.isArray(linksElement) && linksElement.length === 2) {
                    const [urlElement, _] = linksElement
                    if (urlElement !== url) {
                        // получение вложенной страницы и добавление результата
                        const page = await this.getPage(urlElement, recursive)
                        result.push(page)
                    } else {
                        result.push(parsed)
                        firstParsedNotFirst = true
                    }
                } else if ('name' in linksElement) {
                    linksElement
                }
            }

            // добавление результата первого парсинга в начало, если был дубликат url при первой рекурсии
            if (!firstParsedNotFirst) {
                result.unshift(parsed)
            }

            return result
        }

        return parsed
    }

    async run() {
        const links = await this.getTutorialLinks()
        console.log(links)

        const [mainLinks, content] = await this.getMainContent()
        console.log("\n\nMain Links\n\n")
        console.log(mainLinks)
        console.log("\n\nContent\n\n")
        console.log(content)
    }
}

const parser = new MetanitParser()
parser.run()