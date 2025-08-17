import axios from "axios";
import * as cheerio from 'cheerio'

class Data {
    url = "https://metanit.com"
}

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

    // результат - ссылки на следующие материалы в виде массива и контент
    parsePage(html: string): [[string, string][], string] {
        // переменные результата
        let links: Array<[string, string]> = []
        let content: string | null

        const $ = cheerio.load(html)
        const $innerContainer = $(".innercontainer")

        const err = Error("Не удалось получить содержание страницы или главы")

        let innerHtml = $innerContainer.html()

        if (!innerHtml) {
            throw err
        }

        const $2 = cheerio.load(innerHtml)

        const $a = $2(".navmenu > a")

        $a.each((_, element) => {
            const href = $2(element).attr('href')
            if (href) {
                const fullUrl = new URL(href, this.data.url).href
                const name = $2(element).text()
                links.push([fullUrl, name])
            }
        })

        const $itemCenter = $2(".item.center")

        content = $itemCenter.html()

        if (!content) {
            throw err
        }

        return [links, content]
    }

    // результат - ссылки на следующие материалы в виде массива и контент (на главной странице)
    async getMainContent(): Promise<[[string, string][], string]> {
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

    async run() {
        const links = await this.getTutorialLinks()
        console.log(links)

        const [linksPage, content] = await this.getMainContent()
        console.log("\n\nLinks Page\n\n")
        console.log(linksPage)
        console.log("\n\nContent\n\n")
        console.log(content)
    }
}

const parser = new MetanitParser()
parser.run()